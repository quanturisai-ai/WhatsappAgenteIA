import { WhatsAppService } from './whatsapp.service';
import logger from '../utils/logger';

/**
 * Gerenciador global de instâncias WhatsApp
 * Mantém uma instância por usuário
 */
export class WhatsAppManager {
  private static instance: WhatsAppManager;
  private services: Map<number, WhatsAppService> = new Map();
  private initializingUsers: Map<number, Promise<WhatsAppService>> = new Map();

  private constructor() {}

  static getInstance(): WhatsAppManager {
    if (!WhatsAppManager.instance) {
      WhatsAppManager.instance = new WhatsAppManager();
    }
    return WhatsAppManager.instance;
  }

  async getService(userId: number): Promise<WhatsAppService> {
    if (!this.services.has(userId)) {
      const service = new WhatsAppService(userId);
      this.services.set(userId, service);
      logger.info(`Nova instância WhatsApp criada para usuário ${userId}`);
    }
    return this.services.get(userId)!;
  }

  async initializeService(userId: number): Promise<WhatsAppService> {
    // IMPORTANTE: Verificar se já há uma inicialização em andamento
    // Isso previne múltiplas inicializações simultâneas do mesmo usuário
    if (this.initializingUsers.has(userId)) {
      logger.warn(`⚠️ Inicialização já em andamento para usuário ${userId}. Aguardando conclusão...`);
      return await this.initializingUsers.get(userId)!;
    }

    const service = await this.getService(userId);
    
    // CRÍTICO: Verificar se o serviço já está pronto E conectado
    // NÃO inicializar novamente se já estiver conectado - isso causa LOGOUT
    if (service.isReady()) {
      logger.info(`✅ WhatsApp já está pronto e conectado para usuário ${userId}. NÃO reinicializando para evitar múltiplas conexões.`);
      return service;
    }

    // Criar promise de inicialização e armazenar no Map
    const initPromise = (async () => {
      try {
        logger.info(`Iniciando inicialização do WhatsApp para usuário ${userId}...`);
        
        // Verificar se há uma sessão ativa antes de inicializar
        // Se a sessão está ativa no banco, pode ser que o cliente ainda esteja conectado
        // mas não foi inicializado na memória (após restart do servidor)
        try {
          const status = await service.getStatus();
          
          // Verificar também se há arquivos de sessão válidos
          // Isso é importante para reconexão após reiniciar o servidor
          const { WhatsAppSessionModel } = await import('../models/whatsappSession.model');
          const sessionModel = new WhatsAppSessionModel();
          const session = await sessionModel.findByUserId(userId);
          
          if (status === 'connected') {
            logger.warn(`⚠️ Status já é 'connected' para usuário ${userId}. Cliente pode estar ativo - verificando...`);
            // Se status é 'connected', NÃO inicializar novamente - pode estar realmente conectado
            if (service.isReady()) {
              logger.info(`✅ Confirmado: WhatsApp já está pronto para usuário ${userId}. Abortando inicialização.`);
              return service;
            }
          }
          
          if (session?.session_files_path) {
            logger.info(`[Reconnect] Caminho dos arquivos de sessão: ${session.session_files_path}`);
          }
          
          // Inicializar - o LocalAuth vai tentar reutilizar a sessão existente
          await service.initialize();
          
        } catch (error: any) {
          logger.error(`Erro ao verificar status antes de inicializar para usuário ${userId}: ${error.message}`);
          // Em caso de erro, tentar inicializar mesmo assim
          await service.initialize();
        }
        
        return service;
      } finally {
        // SEMPRE remover do Map ao finalizar (sucesso ou erro)
        this.initializingUsers.delete(userId);
      }
    })();

    // Armazenar promise no Map
    this.initializingUsers.set(userId, initPromise);
    
    return await initPromise;
  }

  async disconnectService(userId: number): Promise<void> {
    const service = this.services.get(userId);
    if (service) {
      await service.disconnect();
      this.services.delete(userId);
      logger.info(`Serviço WhatsApp removido para usuário ${userId}`);
    }
  }

  async logoutService(userId: number): Promise<void> {
    const service = this.services.get(userId);
    if (service) {
      try {
        await service.logout();
      } catch (error: any) {
        // Logar erro mas não propagar - logout pode ter problemas com arquivos em uso no Windows
        logger.error(`Erro ao fazer logout do serviço WhatsApp para usuário ${userId}: ${error.message}`);
      } finally {
        // Sempre remover o serviço do Map, mesmo se logout falhou
        this.services.delete(userId);
        logger.info(`Serviço WhatsApp removido para usuário ${userId}`);
      }
    }
  }

  getServiceSync(userId: number): WhatsAppService | null {
    return this.services.get(userId) || null;
  }

  hasService(userId: number): boolean {
    return this.services.has(userId);
  }
}

