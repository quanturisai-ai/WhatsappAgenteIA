import { WhatsAppService } from './whatsapp.service';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs';

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
      // ✅ NÃO deletar o serviço do Map - manter a instância para que os listeners do Socket.IO continuem válidos
      // Ao reconectar, a mesma instância será reutilizada e os eventos chegarão ao frontend
      // this.services.delete(userId); // ❌ REMOVIDO
      logger.info(`Serviço WhatsApp desconectado para usuário ${userId} (instância mantida no Map para reconexão)`);
    }
  }

  async logoutService(userId: number): Promise<void> {
    const service = this.services.get(userId);
    
    if (service) {
      // Se há serviço em memória, usar o logout normal
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
    } else {
      // ✅ CORREÇÃO: Se NÃO há serviço em memória, ainda assim limpar arquivos e banco
      logger.warn(`⚠️ Logout solicitado para usuário ${userId} mas não há serviço em memória. Limpando dados diretamente...`);
      
      try {
        // Deletar arquivos de sessão
        const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
        const userSessionPath = path.join(sessionPath, `user_${userId}`);
        
        if (fs.existsSync(userSessionPath)) {
          logger.info(`🗑️ Deletando arquivos de sessão para usuário ${userId} (sem serviço em memória)...`);
          
          // Tentar deletar com retry em caso de EBUSY
          let retries = 3;
          while (retries > 0) {
            try {
              fs.rmSync(userSessionPath, { recursive: true, force: true });
              logger.info(`✅ Arquivos de sessão deletados para usuário ${userId} de ${userSessionPath}`);
              break;
            } catch (error: any) {
              retries--;
              if (error.code === 'EBUSY' && retries > 0) {
                logger.warn(`Arquivos em uso (EBUSY), aguardando... (${retries} tentativas restantes)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                logger.warn(`Erro ao deletar arquivos de sessão: ${error.message}`);
                break;
              }
            }
          }
        } else {
          logger.debug(`Diretório de sessão não existe para usuário ${userId}: ${userSessionPath}`);
        }
        
        // Remover sessão do banco
        const { WhatsAppSessionModel } = await import('../models/whatsappSession.model');
        const sessionModel = new WhatsAppSessionModel();
        const session = await sessionModel.findByUserId(userId);
        
        if (session) {
          await sessionModel.delete(session.id);
          logger.info(`✅ Sessão removida do banco para usuário ${userId}`);
        } else {
          logger.debug(`Nenhuma sessão encontrada no banco para usuário ${userId}`);
        }
        
        logger.info(`✅ Logout completo para usuário ${userId} (limpeza direta sem serviço em memória)`);
      } catch (error: any) {
        logger.error(`Erro ao fazer logout direto para usuário ${userId}: ${error.message}`);
        throw error;
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

