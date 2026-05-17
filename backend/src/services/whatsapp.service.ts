import { Client, LocalAuth, Message, Chat, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';
import logger from '../utils/logger';
import { WhatsAppSessionModel } from '../models/whatsappSession.model';
import { ConversationModel } from '../models/conversation.model';
import { MessageModel } from '../models/message.model';
import { ReactionModel } from '../models/reaction.model';
import { WhatsAppRawMessageLogger } from '../utils/whatsappRawMessageLogger';
import { emitConversationUpdated, emitConversationNew } from '../utils/conversationSocketEmitter';
// WhatsAppSession type is used in model, not directly imported
import { ConversationService } from './conversation.service';

// IMPORTANTE: Configurar cache do Puppeteer ANTES de qualquer uso
import { setupPuppeteerCache, detectChrome } from '../utils/puppeteer.util';
setupPuppeteerCache();
const chromeExecFound = detectChrome();

export class WhatsAppService extends EventEmitter {
  private client: Client | null = null;
  private userId: number;
  private sessionModel: WhatsAppSessionModel;
  private conversationModel: ConversationModel;
  private messageModel: MessageModel;
  private reactionModel: ReactionModel;
  private conversationService: ConversationService;
  private isInitialized: boolean = false;
  private isClientReady: boolean = false; // Flag para indicar se o cliente está realmente pronto
  private lastQRCode: string | null = null; // Guardar QR code em memória para acesso imediato
  private qrCodeTimeout: NodeJS.Timeout | null = null; // Timeout para limpar QR code expirado
  // Map para rastrear mensagens enviadas pela IA: message_id -> isFromAI
  private pendingAIMessages: Map<string, boolean> = new Map();
  // Map para rastrear media_id de mensagens de mídia: message_id -> media_id
  private pendingMediaIds: Map<string, number> = new Map();
  // Interval para keep-alive -manter sessão ativa
  private keepAliveInterval: NodeJS.Timeout | null = null;
  // Flag para evitar processamento duplicado do evento 'ready'
  private readyProcessing: boolean = false;
  // Flag para evitar processamento duplicado do evento 'authenticated'
  private authenticatedProcessing: boolean = false;
  // Flag para evitar múltiplas inicializações simultâneas
  private initializing: boolean = false;
  // Debounce de mensagens: agrupa várias mensagens curtas do cliente antes de processar com a IA
  private responseTimers: Map<number, NodeJS.Timeout> = new Map();
  private pendingMessages: Map<number, string[]> = new Map();
  // Contador de erros consecutivos no keep-alive
  private keepAliveErrorCount: number = 0;
  // 4 tentativas x 15 min = 1 hora antes de marcar como connection_failed
  private readonly MAX_KEEPALIVE_ERRORS = 4;

  constructor(userId: number) {
    super();
    this.userId = userId;
    this.sessionModel = new WhatsAppSessionModel();
    this.conversationModel = new ConversationModel();
    this.messageModel = new MessageModel();
    this.reactionModel = new ReactionModel();
    this.conversationService = new ConversationService();
  }

  /**
   * Obtém o caminho completo onde o LocalAuth armazena os arquivos de sessão
   * O LocalAuth cria uma subpasta 'session-{clientId}' dentro do dataPath
   */
  private getLocalAuthSessionPath(): string {
    const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
    const userSessionPath = path.join(sessionPath, `user_${this.userId}`);
    const clientId = `user_${this.userId}`;
    // O LocalAuth cria uma subpasta 'session-{clientId}' dentro do dataPath
    const localAuthPath = path.join(userSessionPath, `session-${clientId}`);
    return localAuthPath;
  }

  /**
   * Mata processos Chrome/Chromium que estão usando o diretório da sessão.
   * Usado no logout para garantir que o browser seja encerrado antes de deletar arquivos,
   * evitando "browser is already running" ao reconectar.
   */
  private async killBrowserProcessesForSession(userSessionPath: string): Promise<void> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    if (process.platform === 'win32') {
      try {
        // Nome da pasta do LocalAuth (ex: session-user_1) -usada na linha de comando do Chrome
        const folderName = path.basename(userSessionPath); // ex: user_1
        const sessionFolderName = `session-${folderName}`;
        // PowerShell: matar processos chrome.exe cuja CommandLine contenha o path da sessão
        const psScript = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${sessionFolderName}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1`;
        await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "& { ${psScript} }"`, { timeout: 15000 });
        logger.info(`✅ Verificação de processos Chrome para sessão do usuário ${this.userId} concluída`);
      } catch (error: any) {
        // Fallback: tentar taskkill genérico para Chrome com título WhatsApp
        try {
          await execAsync('taskkill /F /IM chrome.exe /FI "WINDOWTITLE eq *WhatsApp*" 2>nul', { timeout: 5000 });
        } catch (_) {
          // Ignorar -pode não haver processos
        }
        logger.debug(`killBrowserProcessesForSession(Windows): ${error.message}`);
      }
    }
    // Linux/Mac: opcionalmente usar pkill com o path; por ora não implementado
  }

  /**
   * Fecha o browser do Puppeteer explicitamente (pupBrowser) com timeout.
   * Evita que o processo Chrome fique órfão após logout/destroy.
   */
  private async closeBrowserSafely(): Promise<void> {
    const client = this.client as any;
    if (!client?.pupBrowser) return;
    try {
      const browser = client.pupBrowser;
      const closePromise = browser.close();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Browser close timeout')), 10000)
      );
      await Promise.race([closePromise, timeoutPromise]);
      logger.info(`✅ Browser fechado explicitamente para usuário ${this.userId}`);
    } catch (error: any) {
      logger.warn(`Fechamento explícito do browser para usuário ${this.userId}: ${error.message}`);
    }
  }

  /**
   * Remove arquivos de lock do diretório da sessão (session-user_X) para evitar
   * "browser is already running" ao reconectar. Usado no logout.
   */
  private removeLockFilesFromSession(localAuthPath: string): void {
    const lockFiles = ['lockfile', 'DevToolsActivePort', 'SingletonLock'];
    for (const name of lockFiles) {
      const filePath = path.join(localAuthPath, name);
      try {
        if (fs.existsSync(filePath)) {
          fs.rmSync(filePath, { force: true });
          logger.info(`✅ Lock removido no logout: ${name} (usuário ${this.userId})`);
        }
      } catch (error: any) {
        logger.debug(`Erro ao remover lock ${name} no logout: ${error.message}`);
      }
    }
  }

  /**
   * Verifica se há arquivos de sessão válidos do LocalAuth
   * Retorna informações detalhadas sobre os arquivos encontrados
   */
  private checkLocalAuthSessionFiles(): {
    exists: boolean;
    path: string;
    files: string[];
    count: number;
    hasAuthFiles: boolean;
    hasDefaultProfile: boolean;
    authPath: string;
  } {
    const localAuthPath = this.getLocalAuthSessionPath();
    const userSessionPath = path.dirname(localAuthPath);
    const authPath = path.join(localAuthPath, '.wwebjs_auth');
    const defaultProfilePath = path.join(localAuthPath, 'Default');

    logger.debug(`[Session Check] Verificando arquivos de sessão para usuário ${this.userId}`);
    logger.debug(`[Session Check] Caminho base(dataPath): ${userSessionPath}`);
    logger.debug(`[Session Check] Caminho LocalAuth(session-{ clientId }): ${localAuthPath}`);
    logger.debug(`[Session Check]Caminho.wwebjs_auth: ${authPath}`);
    logger.debug(`[Session Check] Caminho Default profile: ${defaultProfilePath}`);

    // Verificar se o diretório base existe
    if (!fs.existsSync(userSessionPath)) {
      logger.debug(`[Session Check] Diretório base não existe: ${userSessionPath}`);
      return {
        exists: false,
        path: localAuthPath,
        files: [],
        count: 0,
        hasAuthFiles: false,
        hasDefaultProfile: false,
        authPath
      };
    }

    // Verificar se o diretório do LocalAuth existe
    if (!fs.existsSync(localAuthPath)) {
      logger.debug(`[Session Check] Diretório LocalAuth não existe: ${localAuthPath}`);
      // Verificar se há arquivos no diretório base (pode ser estrutura antiga)
      try {
        const baseFiles = fs.readdirSync(userSessionPath);
        logger.debug(`[Session Check] Diretório base existe mas LocalAuth não.Arquivos no base: ${baseFiles.length}`);
        return {
          exists: baseFiles.length > 0,
          path: userSessionPath,
          files: baseFiles,
          count: baseFiles.length,
          hasAuthFiles: false,
          hasDefaultProfile: false,
          authPath
        };
      } catch (error: any) {
        logger.debug(`[Session Check] Erro ao ler diretório base: ${error.message}`);
        return {
          exists: false,
          path: localAuthPath,
          files: [],
          count: 0,
          hasAuthFiles: false,
          hasDefaultProfile: false,
          authPath
        };
      }
    }

    // Ler arquivos do diretório LocalAuth
    try {
      const files = fs.readdirSync(localAuthPath);
      logger.debug(`[Session Check] Arquivos encontrados no LocalAuth: ${files.length}`);
      logger.debug(`[Session Check] Primeiros arquivos: ${files.slice(0, 10).join(', ')}`);

      // Verificar explicitamente se .wwebjs_auth existe (diretório oculto)
      const hasAuthFiles = fs.existsSync(authPath) && fs.statSync(authPath).isDirectory();
      if (hasAuthFiles) {
        try {
          const authFiles = fs.readdirSync(authPath);
          logger.debug(`[Session Check] Arquivos em.wwebjs_auth: ${authFiles.length}`);
          logger.debug(`[Session Check] Arquivos de auth: ${authFiles.join(', ')}`);
        } catch (error: any) {
          logger.debug(`[Session Check] Erro ao ler.wwebjs_auth: ${error.message}`);
        }
      }

      // Verificar se o perfil Default existe
      const hasDefaultProfile = fs.existsSync(defaultProfilePath) && fs.statSync(defaultProfilePath).isDirectory();
      if (hasDefaultProfile) {
        try {
          const defaultFiles = fs.readdirSync(defaultProfilePath);
          logger.debug(`[Session Check] Arquivos em Default profile: ${defaultFiles.length}`);
        } catch (error: any) {
          logger.debug(`[Session Check] Erro ao ler Default profile: ${error.message}`);
        }
      }

      // Considerar válido se tiver arquivos de autenticação OU perfil Default
      const isValid = hasAuthFiles || (hasDefaultProfile && files.length > 0);

      logger.debug(`[Session Check]Resultado: hasAuthFiles = ${hasAuthFiles}, hasDefaultProfile = ${hasDefaultProfile}, isValid = ${isValid}`);

      return {
        exists: isValid,
        path: localAuthPath,
        files: files,
        count: files.length,
        hasAuthFiles,
        hasDefaultProfile,
        authPath
      };
    } catch (error: any) {
      logger.debug(`[Session Check] Erro ao ler diretório LocalAuth: ${error.message}`);
      return {
        exists: false,
        path: localAuthPath,
        files: [],
        count: 0,
        hasAuthFiles: false,
        hasDefaultProfile: false,
        authPath
      };
    }
  }

  async initialize(retryCount: number = 0): Promise<void> {
    // ✅ CRÍTICO: Se já está conectado e pronto, RECUSAR nova inicialização
    // Isso previne múltiplas instâncias que causam LOGOUT
    if (this.isClientReady && this.client) {
      logger.error(`🔴 TENTATIVA DE REINICIALIZAÇÃO BLOQUEADA para usuário ${this.userId}`);
      logger.error(`🔴 Cliente já está pronto e conectado(isClientReady = ${this.isClientReady})`);
      logger.error(`🔴 Isso causaria múltiplas conexões e LOGOUT.Se precisa reconectar, use disconnect() primeiro.`);
      throw new Error('Cliente WhatsApp já está conectado. Use disconnect() antes de inicializar novamente.');
    }

    // Evitar múltiplas inicializações simultâneas
    if (this.initializing) {
      logger.warn(`Inicialização já em andamento para usuário ${this.userId}, aguardando...`);
      // Aguardar até que a inicialização atual termine
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return;
    }

    // ✅ CORREÇÃO: Se há erro "connection_failed" de tentativa anterior, limpar processos Chrome e locks
    // antes de tentar inicializar. Isso resolve "browser already running" em reconexões.
    // Os arquivos de sessão (.wwebjs_auth, Default) são preservados para reconexão automática.
    if (retryCount === 0) {
      try {
        const currentSession = await this.sessionModel.findByUserId(this.userId);
        if (currentSession?.status === 'connection_failed') {
          logger.warn(`⚠️ Status 'connection_failed' detectado para usuário ${this.userId}. Limpando processos Chrome e locks antes de inicializar...`);

          const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
          const userSessionPath = path.join(sessionPath, `user_${this.userId}`);

          await this.killBrowserProcessesForSession(userSessionPath);
          await new Promise(resolve => setTimeout(resolve, 1000));

          const localAuthPath = this.getLocalAuthSessionPath();
          if (fs.existsSync(localAuthPath)) {
            this.removeLockFilesFromSession(localAuthPath);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
          logger.info(`✅ Limpeza completa realizada para usuário ${this.userId}. Prosseguindo com inicialização(arquivos de sessão preservados)...`);
        }
      } catch (error: any) {
        logger.debug(`Erro ao verificar / limpar status connection_failed: ${error.message}. Continuando...`);
      }
    }

    this.initializing = true;

    try {
      // IMPORTANTE: Desconectar completamente cliente anterior antes de criar novo
      // Isso evita "não é possível realizar uma nova conexão" do WhatsApp
      // Issue #3895: Múltiplas conexões causam bloqueio
      if (this.client) {
        logger.info(`Desconectando cliente anterior antes de inicializar novo para usuário ${this.userId}...`);
        try {
          // Parar keep-alive primeiro
          this.stopKeepAlive();

          // Remover todos os listeners
          this.client.removeAllListeners();

          // Tentar destruir o cliente
          try {
            await this.client.destroy();
          } catch (error: any) {
            logger.warn(`Erro ao destruir cliente anterior: ${error.message}. Continuando...`);
          }

          // Limpar referências
          this.client = null;
          this.isInitialized = false;
          this.isClientReady = false;
          this.lastQRCode = null;
          if (this.qrCodeTimeout) {
            clearTimeout(this.qrCodeTimeout);
            this.qrCodeTimeout = null;
          }

          // Aguardar um pouco para garantir que o cliente foi destruído
          await new Promise(resolve => setTimeout(resolve, 2000));

          logger.info(`Cliente anterior desconectado para usuário ${this.userId}`);
        } catch (error: any) {
          logger.error(`Erro ao desconectar cliente anterior: ${error.message}. Continuando...`);
          // Mesmo se falhar, limpar referências
          this.client = null;
          this.isInitialized = false;
          this.isClientReady = false;
        }
      }

      // IMPORTANTE: Se já está inicializado e conectado, não reinicializar
      // Isso evita múltiplas conexões simultâneas
      if (this.isInitialized && this.isClientReady) {
        logger.info(`WhatsApp já inicializado e pronto para usuário ${this.userId}`);
        this.initializing = false;
        return;
      }

      // Criar diretório de sessões se não existir
      const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
      const userSessionPath = path.join(sessionPath, `user_${this.userId}`);

      // IMPORTANTE: userSessionPath deve estar definido antes de usar nos puppeteerArgs

      // IMPORTANTE: Verificar se há uma sessão ativa no WhatsApp antes de inicializar
      // Se a sessão está ativa no banco e os arquivos de sessão existem, tentar reutilizar
      try {
        const savedSession = await this.sessionModel.findByUserId(this.userId);
        if (savedSession && savedSession.status === 'connected' && fs.existsSync(userSessionPath)) {
          logger.info(`Sessão ativa encontrada para usuário ${this.userId}. Tentando reutilizar sessão existente...`);

          // Verificar se os arquivos de sessão são válidos (não muito antigos)
          const sessionAge = savedSession.updated_at ? Date.now() - new Date(savedSession.updated_at).getTime() : Infinity;
          const oneDay = 24 * 60 * 60 * 1000; // 1 dia

          if (sessionAge < oneDay) {
            logger.info(`Sessão recente encontrada(${Math.round(sessionAge / 1000 / 60)} minutos).Tentando reutilizar...`);
            // Não limpar a sessão -tentar usar a existente
            // O LocalAuth vai tentar reutilizar automaticamente
          } else {
            logger.warn(`Sessão antiga encontrada(${Math.round(sessionAge / 1000 / 60 / 60)} horas).Pode precisar de nova autenticação.`);
          }
        }
      } catch (error: any) {
        logger.warn(`Erro ao verificar sessão existente: ${error.message}. Continuando com inicialização...`);
      }

      // IMPORTANTE: Verificar se há arquivos de sessão válidos ANTES de limpar QR code
      // Usar a função auxiliar que verifica o caminho correto do LocalAuth
      try {
        const existingSession = await this.sessionModel.findByUserId(this.userId);
        const sessionCheck = this.checkLocalAuthSessionFiles();

        logger.info(`[Session Check] Verificação de arquivos de sessão para usuário ${this.userId}: `);
        logger.info(`[Session Check]- Caminho verificado: ${sessionCheck.path}`);
        logger.info(`[Session Check]- Arquivos encontrados: ${sessionCheck.count}`);
        logger.info(`[Session Check]- Sessão válida: ${sessionCheck.exists}`);

        if (existingSession && sessionCheck.exists) {
          // Se há arquivos de sessão válidos, NÃO limpar QR code -tentar reutilizar
          logger.info(`✅ Arquivos de sessão válidos encontrados para usuário ${this.userId} em ${sessionCheck.path}`);
          logger.info(`[Session Check] Status atual no banco: ${existingSession.status}`);
          logger.info(`[Session Check] Tentando reutilizar sessão existente sem gerar novo QR code...`);
          // NÃO limpar QR code -manter para tentar reutilizar
          // O LocalAuth vai tentar reutilizar automaticamente
        } else if (existingSession && existingSession.qr_code && !sessionCheck.exists) {
          // Só limpar QR code se não houver arquivos de sessão válidos
          logger.info(`⚠️ Nenhum arquivo de sessão válido encontrado para usuário ${this.userId} em ${sessionCheck.path}`);
          logger.info(`[Session Check] Limpando QR code antigo antes de gerar novo...`);
          await this.sessionModel.updateByUserId(this.userId, {
            qr_code: undefined,
            status: 'connection_failed', // Falha técnica, não desconexão manual
          });
          // Aguardar um pouco para garantir que a atualização foi commitada
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (existingSession && existingSession.qr_code) {
          // IMPORTANTE: Verificar se o QR code está expirado mesmo se houver arquivos de sessão
          // Se o QR code está expirado (mais de 2 minutos), limpar para forçar geração de novo
          if (existingSession.updated_at) {
            const qrCodeAge = Date.now() - new Date(existingSession.updated_at).getTime();
            const qrCodeExpirationTime = 2 * 60 * 1000; // 2 minutos

            if (qrCodeAge > qrCodeExpirationTime) {
              logger.warn(`⚠️ QR code expirado encontrado na inicialização para usuário ${this.userId} (idade: ${Math.round(qrCodeAge / 1000 / 60)} minutos). Limpando...`);
              await this.sessionModel.updateByUserId(this.userId, {
                qr_code: undefined,
                // ✅ Manter status atual -não alterar para 'disconnected' (só no logout manual)
                status: existingSession.status,
              });
              this.lastQRCode = null;
              logger.info(`✅ QR code expirado limpo na inicialização para usuário ${this.userId}`);
            } else {
              logger.debug(`QR code válido encontrado na inicialização para usuário ${this.userId} (idade: ${Math.round(qrCodeAge / 1000)} segundos)`);
            }
          }
        } else if (!existingSession) {
          // Não há sessão no banco, criar nova
          logger.info(`[Session Check] Nenhuma sessão encontrada para usuário ${this.userId}. Criando nova sessão...`);
        }
      } catch (error: any) {
        logger.warn(`Erro ao verificar / limpar QR code antigo: ${error.message}. Continuando...`);
      }

      // IMPORTANTE: Limpar processos órfãos do Chrome antes de inicializar
      // Baseado nas issues do repositório: processos órfãos causam conflitos e LOGOUT imediato
      // IMPORTANTE: Aguardar a limpeza de processos antes de continuar
      try {
        const { exec } = require('child_process');
        if (process.platform === 'win32') {
          // No Windows, verificar e fechar processos do Chrome relacionados ao WhatsApp
          // Usar Promise para aguardar a limpeza
          await new Promise<void>((resolve) => {
            exec(`tasklist / FI "IMAGENAME eq chrome.exe" / FI "WINDOWTITLE eq *WhatsApp*" 2 > nul`, (error: any, stdout: any) => {
              if (!error && stdout && stdout.includes('chrome.exe')) {
                logger.warn(`Processos do Chrome relacionados ao WhatsApp encontrados.Fechando...`);
                exec(`taskkill / F / IM chrome.exe / FI "WINDOWTITLE eq *WhatsApp*" 2 > nul`, (killError: any) => {
                  if (killError) {
                    // Ignorar erros -pode não haver processos para matar
                    logger.debug(`Nenhum processo do Chrome relacionado ao WhatsApp encontrado ou já foi fechado`);
                  } else {
                    logger.info(`Processos do Chrome relacionados ao WhatsApp fechados`);
                  }
                  // Aguardar um pouco para garantir que os processos foram fechados
                  setTimeout(() => resolve(), 2000);
                });
              } else {
                resolve();
              }
            });
          });
        }
      } catch (error: any) {
        // Ignorar erros ao verificar processos, mas logar para debug
        logger.debug(`Erro ao verificar / fechar processos do Chrome: ${error.message}`);
      }

      // IMPORTANTE: Verificar sessão existente antes de inicializar
      // Baseado nas issues #3895 e #3935: múltiplas conexões e logout via dispositivo móvel
      // Não limpar sessões muito recentes para evitar conflitos com logout via dispositivo móvel
      const savedSession = await this.sessionModel.findByUserId(this.userId);

      // IMPORTANTE: Só limpar sessões se não há cliente ativo E a sessão é realmente antiga
      // Issue #3935: Logout via dispositivo móvel pode acionar limpeza de sessão
      // Não limpar sessões muito recentes (menos de 1 hora) para evitar deletar sessões válidas
      if (!this.client && savedSession) {
        const sessionAge = savedSession.updated_at ? Date.now() - new Date(savedSession.updated_at).getTime() : Infinity;
        const oneHour = 60 * 60 * 1000; // Aumentado para 1 hora para ser menos agressivo (Issue #3935)

        // ✅ REGRA: NÃO deletar arquivos de sessão baseado em idade ou status
        // Arquivos só devem ser deletados no logout() manual do usuário
        // Mesmo se a sessão é antiga, manter os arquivos para tentar reconexão automática
        if (sessionAge > oneHour && (savedSession.status === 'disconnected' || savedSession.status === 'connecting')) {
          logger.info(`Sessão antiga encontrada para usuário ${this.userId} (${Math.round(sessionAge / 1000 / 60)} minutos, status: ${savedSession.status}).`);
          logger.info(`✅ Mantendo arquivos de sessão para tentar reconexão automática.`);
          logger.info(`Arquivos só serão deletados no logout manual do usuário.`);
          // NÃO DELETAR -deixar arquivos para reconexão
        } else if (sessionAge <= oneHour) {
          logger.debug(`Sessão recente encontrada para usuário ${this.userId} (${Math.round(sessionAge / 1000 / 60)} minutos). Mantendo arquivos para reconexão.`);
        }

        // IMPORTANTE: Se há uma sessão com status 'connected' mas o cliente não está pronto,
        // NÃO limpar automaticamente -pode ser que a sessão ainda esteja ativa no WhatsApp
        // Apenas tentar reutilizar a sessão existente
        // Issue #2164: Problemas de persistência de sessão -não limpar sessões recentes
        if (savedSession.status === 'connected' && !this.isClientReady) {
          const sessionCheck = this.checkLocalAuthSessionFiles();
          if (sessionCheck.exists) {
            logger.info(`✅ Sessão 'connected' encontrada para usuário ${this.userId} mas cliente não está pronto.`);
            logger.info(`[Session Check] Arquivos de sessão válidos encontrados em ${sessionCheck.path}`);
            logger.info(`[Session Check] Tentando reutilizar sessão existente...`);
            // NÃO limpar -tentar reutilizar a sessão existente
            // O LocalAuth vai tentar reutilizar automaticamente
          } else {
            // Se os arquivos não existem mas o status é 'connected', pode ser uma inconsistência
            // Atualizar status para 'connection_failed' (falha técnica, não desconexão manual)
            logger.warn(`⚠️ Sessão 'connected' encontrada para usuário ${this.userId} mas arquivos de sessão não existem em ${sessionCheck.path}`);
            logger.warn(`[Session Check] Atualizando status para 'connection_failed'...`);
            await this.sessionModel.updateByUserId(this.userId, {
              status: 'connection_failed',
              qr_code: undefined,
            });
          }
        }
      }

      // IMPORTANTE: NÃO limpar arquivos de sessão se a sessão está ativa
      // Apenas limpar se a sessão está realmente desconectada e antiga
      // Isso mantém a sessão ativa por tempo indeterminado até que o usuário desconecte manualmente
      // IMPORTANTE: Usar a função auxiliar que verifica o caminho correto do LocalAuth
      try {
        const currentSession = await this.sessionModel.findByUserId(this.userId);
        const sessionCheck = this.checkLocalAuthSessionFiles();

        if (currentSession && currentSession.status === 'connected' && sessionCheck.exists) {
          logger.info(`✅ Sessão ativa encontrada para usuário ${this.userId}.`);
          logger.info(`[Session Check] Mantendo arquivos de sessão em ${sessionCheck.path} para reutilização.`);
          // NÃO limpar -manter a sessão ativa
        } else if (sessionCheck.exists && currentSession && currentSession.status !== 'connected') {
          // ✅ REGRA: NÃO deletar arquivos baseado em status
          // Arquivos só devem ser deletados no logout() manual do usuário
          // Manter arquivos para tentar reconexão automática
          logger.info(`✅ Arquivos de sessão válidos encontrados para usuário ${this.userId} em ${sessionCheck.path}`);
          logger.info(`[Session Check] Status atual: ${currentSession.status}. Mantendo arquivos para tentar reconexão.`);
          logger.info(`[Session Check] O LocalAuth tentará reutilizar a sessão existente.`);
          logger.info(`[Session Check] Arquivos só serão deletados no logout manual do usuário.`);
          // NÃO DELETAR -deixar LocalAuth tentar reutilizar
        }
      } catch (error: any) {
        logger.warn(`Erro ao verificar / limpar arquivos de sessão: ${error.message}. Continuando...`);
      }

      // Criar diretório de sessões se não existir
      if (!fs.existsSync(userSessionPath)) {
        fs.mkdirSync(userSessionPath, { recursive: true });
      }

      // Verificar se já existe sessão no banco, senão criar
      // IMPORTANTE: Usar a função auxiliar que verifica o caminho correto do LocalAuth
      let currentSession = await this.sessionModel.findByUserId(this.userId);
      const sessionCheck = this.checkLocalAuthSessionFiles();

      logger.info(`[Session Check] Verificação final antes de inicializar para usuário ${this.userId}: `);
      logger.info(`[Session Check]- Caminho verificado: ${sessionCheck.path}`);
      logger.info(`[Session Check]- Arquivos encontrados: ${sessionCheck.count}`);
      logger.info(`[Session Check]- Sessão válida: ${sessionCheck.exists}`);
      logger.info(`[Session Check]- Tem arquivos de auth: ${sessionCheck.hasAuthFiles}`);
      logger.info(`[Session Check]- Tem perfil Default: ${sessionCheck.hasDefaultProfile}`);

      if (!currentSession) {
        // Usar getOrCreateSession para garantir unicidade
        currentSession = await this.sessionModel.getOrCreateSession(this.userId);

        // Atualizar caminho dos arquivos se existirem
        if (sessionCheck.exists) {
          await this.sessionModel.updateByUserId(this.userId, {
            session_files_path: sessionCheck.path,
          });
        }
        logger.info(`Sessão WhatsApp obtida / criada para usuário ${this.userId}: ID = ${currentSession.id}`);
      } else {
        logger.debug(`Sessão WhatsApp encontrada para usuário ${this.userId} -Status: ${currentSession.status}`);

        // IMPORTANTE: Se há arquivos de sessão válidos, atualizar caminho e manter status
        // Tentar reutilizar a sessão existente
        if (sessionCheck.exists) {
          logger.info(`✅ Arquivos de sessão válidos encontrados para usuário ${this.userId} em ${sessionCheck.path}`);
          logger.info(`[Session Check] Mantendo status atual(${currentSession.status}) para tentar reutilizar sessão.`);

          // Atualizar caminho dos arquivos de sessão se mudou
          if (currentSession.session_files_path !== sessionCheck.path) {
            logger.info(`[Session Check] Atualizando caminho dos arquivos de sessão: ${sessionCheck.path}`);
            await this.sessionModel.updateByUserId(this.userId, {
              session_files_path: sessionCheck.path,
            });
          }
        } else if (currentSession.status !== 'disconnected' && currentSession.status !== 'connecting' && currentSession.status !== 'connection_failed') {
          // Só atualizar status se não houver arquivos de sessão válidos
          logger.warn(`⚠️ Sessão com status '${currentSession.status}' encontrada mas sem arquivos de sessão válidos em ${sessionCheck.path}`);
          logger.warn(`[Session Check] Atualizando para 'connection_failed' antes de inicializar...`);
          await this.sessionModel.updateByUserId(this.userId, {
            status: 'connection_failed',
            qr_code: undefined,
            session_files_path: null,
          });
        }
      }

      // Detectar Google Chrome para melhor estabilidade
      let chromeExec = detectChrome();

      // Cache do Puppeteer já foi configurado no início do arquivo
      // Apenas verificar se o diretório existe
      const userCacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.puppeteer_cache');
      if (!fs.existsSync(userCacheDir)) {
        try {
          fs.mkdirSync(userCacheDir, { recursive: true });
          logger.info(`Cache do Puppeteer criado em: ${userCacheDir}`);
        } catch (error: any) {
          logger.warn(`Não foi possível criar cache do Puppeteer: ${error.message}`);
        }
      }

      // Configurar cliente WhatsApp -usando configuração similar ao servermodelo.js
      // Argumentos para evitar conflitos de perfil do Chrome no Windows (erro 32: Lock file)
      // E também para evitar erro de criptografia do Windows
      // ✅ Argumentos otimizados do Puppeteer (baseado em pesquisa e best practices)
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        // 🚀 Performance -Desabilitar recursos desnecessários
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        // Recursos adicionais de otimização
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-extensions-with-background-pages',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-features=RendererCodeIntegrity',
        // Windows específico
        '--disable-password-manager',
        '--disable-features=PasswordManager',
      ];

      // Configurar Puppeteer -configuração otimizada
      const puppeteerConfig: any = {
        headless: true,
        args: puppeteerArgs,
        // 🚀 Timeout maior para permitir sincronização completa
        timeout: 60000, // 60s para inicialização e sincronização
        // Nota: O cache do Puppeteer é gerenciado pela variável de ambiente PUPPETEER_CACHE_DIR
        // que já foi configurada acima
      };

      // Se encontrou Chrome, usar explicitamente (igual ao servermodelo.js)
      // IMPORTANTE: No Windows, pode haver problemas com o Chrome instalado
      // Se o Chrome não funcionar, o Puppeteer tentará usar o Chromium automaticamente
      if (chromeExec) {
        // Verificar se o Chrome realmente existe e é executável
        try {
          const stats = fs.statSync(chromeExec);
          if (stats.isFile()) {
            puppeteerConfig.executablePath = chromeExec;
            logger.info(`Configurando Puppeteer para usar Chrome em: ${chromeExec}`);
          } else {
            logger.warn(`Chrome encontrado mas não é um arquivo válido: ${chromeExec}`);
            logger.info(`Usando Chromium padrão do Puppeteer`);
            // Não definir executablePath -deixar Puppeteer usar Chromium
          }
        } catch (error: any) {
          logger.warn(`Erro ao verificar Chrome em ${chromeExec}: ${error.message}`);
          logger.info(`Usando Chromium padrão do Puppeteer`);
          // Não definir executablePath -deixar Puppeteer usar Chromium
        }
      } else {
        logger.info(`Chrome não encontrado.Usando Chromium padrão do Puppeteer(será baixado automaticamente se necessário)`);
        // Não definir executablePath -deixar Puppeteer usar Chromium
      }

      // Configurar cliente com opções para evitar múltiplas conexões
      // IMPORTANTE: Usar clientId único e dataPath isolado para cada usuário
      // Baseado nas issues do repositório: https://github.com/pedroslopez/whatsapp-web.js/issues
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: `user_${this.userId}`,
          dataPath: userSessionPath,
        }),
        puppeteer: puppeteerConfig,
        // ✅ CRÍTICO: Configurações para prevenir múltiplas conexões e LOGOUT
        // takeoverOnConflict: false previne assumir outras conexões
        // restartOnAuthFail: false previne loops de reconexão
        takeoverOnConflict: false,
        restartOnAuthFail: false,
        // Aumentar qrMaxRetries pode ajudar a evitar reinicializações
        qrMaxRetries: 5,
      });

      // Configurar eventos
      this.setupEvents();

      // Atualizar status para connecting
      await this.sessionModel.updateByUserId(this.userId, {
        status: 'connecting',
      });

      // Resetar flag de pronto
      this.isClientReady = false;

      // Inicializar cliente com timeout aumentado
      logger.info(`Iniciando inicialização do WhatsApp para usuário ${this.userId}...`);
      logger.info(`Chrome executável: ${chromeExec || 'Chromium padrão do Puppeteer'}`);
      logger.info(`Args do Puppeteer: ${puppeteerArgs.join(' ')}`);

      // Verificar se o Chrome existe antes de inicializar
      if (chromeExec && !fs.existsSync(chromeExec)) {
        logger.warn(`⚠️ Chrome executável não encontrado em ${chromeExec}, usando Chromium padrão`);
        chromeExec = undefined;
        // Atualizar configuração do Puppeteer
        delete puppeteerConfig.executablePath;
      }

      // Inicializar cliente (sem timeout customizado -deixar o Puppeteer gerenciar)
      logger.info(`Iniciando client.initialize() para usuário ${this.userId}...`);
      try {
        await this.client.initialize();
        this.isInitialized = true;
        logger.info(`✅ WhatsApp cliente inicializado para usuário ${this.userId}`);
        logger.info(`Aguardando QR code ou autenticação para usuário ${this.userId}...`);
      } catch (error: any) {
        logger.error(`Erro durante client.initialize() para usuário ${this.userId}: ${error.message}`);
        throw error;
      }
    } catch (error: any) {
      logger.error(`Erro ao inicializar WhatsApp para usuário ${this.userId}: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);

      // Se o erro for sobre browser, fornecer mensagem mais útil
      if (error.message.includes('Failed to launch') || error.message.includes('browser process')) {
        logger.error(`SOLUÇÃO: Instale o Google Chrome ou execute: npm install puppeteer--save`);
        logger.error(`Ou verifique se o Chromium foi baixado corretamente pelo Puppeteer.`);
      }

      // Se o erro for sobre Chrome não encontrado, fornecer instruções específicas
      if (error.message.includes('Could not find Chrome') || error.message.includes('cache path is incorrectly configured')) {
        logger.error(`❌ ERRO: Chrome não encontrado ou cache path incorreto`);
        logger.error(`SOLUÇÃO 1: Instale o Chrome via Puppeteer executando no diretório backend: `);
        logger.error(`   npx puppeteer browsers install chrome`);
        logger.error(`SOLUÇÃO 2: Ou instale o Google Chrome manualmente: `);
        logger.error(`   https://www.google.com/chrome/`);
        logger.error(`Cache path configurado: ${process.env.PUPPETEER_CACHE_DIR || 'não configurado'}`);
      }


      // Auto-recovery para erro "Browser already running" ou "Lock file"
      if ((error.message.includes('browser is already running') ||
        error.message.includes('Lock file can not be created') ||
        error.message.includes('EBUSY')) && retryCount < 3) {

        logger.warn(`⚠️ Detectado bloqueio de sessão (tentativa ${retryCount + 1}/3). Tentando limpar lock files e reiniciar...`);

        try {
          const localAuthPath = this.getLocalAuthSessionPath();
          // Tentar limpar arquivos específicos de lock no diretório do perfil
          // O caminho exato depende da estrutura, mas geralmente é dentro do userDataDir
          // userDataDir configurado pelo wwebjs é localAuthPath (que é session-user_1)

          const lockFile = path.join(localAuthPath, 'lockfile');
          const portFile = path.join(localAuthPath, 'DevToolsActivePort');
          const singletonLock = path.join(localAuthPath, 'SingletonLock');

          if (fs.existsSync(lockFile)) {
            try { fs.rmSync(lockFile, { force: true }); logger.info('Removido lockfile'); } catch (e) { }
          }
          if (fs.existsSync(portFile)) {
            try { fs.rmSync(portFile, { force: true }); logger.info('Removido DevToolsActivePort'); } catch (e) { }
          }
          if (fs.existsSync(singletonLock)) {
            try { fs.rmSync(singletonLock, { force: true }); logger.info('Removido SingletonLock'); } catch (e) { }
          }

          // Aguardar 2 segundos para o sistema liberar recursos
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Retentar inicialização
          this.initializing = false; // Resetar flag para permitir reentrada
          return this.initialize(retryCount + 1);

        } catch (cleanupError: any) {
          logger.error(`Erro ao tentar limpar lock files: ${cleanupError.message}`);
        }
      }

      await this.sessionModel.updateByUserId(this.userId, {
        status: 'connection_failed', // Falha ao inicializar cliente
      });

      // Limpar cliente em caso de erro
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (destroyError: any) {
          logger.warn(`Erro ao destruir cliente após falha: ${destroyError.message}`);
        }
        this.client = null;
      }

      this.isInitialized = false;
      this.initializing = false; // Resetar flag em caso de erro
      throw error;
    } finally {
      this.initializing = false; // Sempre resetar flag ao finalizar
    }
  }

  /**
   * 🚀 DETECÇÃO ROBUSTA DE CONEXÃO
   * Método alternativo que não depende do evento 'ready' (que pode não disparar)
   * Usa: authenticated + CONNECTED + getChats() com retry e backoff exponencial
   * Baseado em: https://github.com/Julzk/whatsapp-web.js/tarball/jkr_hotfix_7
   */
  private async waitForConnectionReady(): Promise<void> {
    if (!this.client || this.isClientReady) {
      return;
    }

    logger.info(`[Conexão Robusta] Aguardando 5s para estabilização após authenticated...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Delays com backoff exponencial: 5s, 10s, 15s, 20s, 30s, 45s, 60s
    const delays = [5000, 10000, 15000, 20000, 30000, 45000, 60000];

    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (this.isClientReady) {
        logger.info(`[Conexão Robusta] Cliente já está pronto (via evento ready). Encerrando detecção alternativa.`);
        return;
      }

      try {
        // 1. Verificar estado
        const state = await this.client!.getState();
        const stateStr = String(state);

        logger.info(`[Conexão Robusta] Tentativa ${attempt + 1}/${delays.length} -Estado: ${stateStr}`);

        if (stateStr !== 'CONNECTED') {
          logger.warn(`[Conexão Robusta] Estado não é CONNECTED (${stateStr}), aguardando ${delays[attempt] / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          continue;
        }

        // 2. Verificar client.info
        const info = this.client!.info;
        if (!info) {
          logger.warn(`[Conexão Robusta] client.info não disponível, aguardando ${delays[attempt] / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          continue;
        }

        // 3. Testar conexão real com getChats()
        logger.info(`[Conexão Robusta] Testando conexão real com getChats()...`);
        const chats = await this.client!.getChats();

        // ✅ SUCESSO! Cliente está realmente pronto
        logger.info(`✅✅✅ [Conexão Robusta] CLIENTE PRONTO via detecção alternativa!`);
        logger.info(`   • Chats carregados: ${chats.length}`);
        logger.info(`   • WID: ${info.wid?.user}`);
        logger.info(`   • Nome: ${info.pushname}`);
        logger.info(`   • Plataforma: ${info.platform}`);
        logger.info(`   • Tempo total: ${attempt + 1} tentativa(s)`);

        // Marcar como pronto
        this.isClientReady = true;
        this.authenticatedProcessing = false;

        // Atualizar banco de dados
        await this.sessionModel.updateByUserId(this.userId, {
          status: 'connected',
          authenticated: true,
          qr_code: undefined,
        });

        // Emitir evento para Socket.IO
        this.io.to(`user_${this.userId}`).emit('whatsapp_status', {
          status: 'connected',
          authenticated: true,
          message: 'WhatsApp conectado com sucesso!',
        });

        // Iniciar keep-alive
        this.startKeepAlive();

        logger.info(`✅ WhatsApp totalmente operacional para usuário ${this.userId} (via detecção robusta)`);
        return;

      } catch (error: any) {
        const errorMsg = error.message.substring(0, 100);
        logger.warn(`[Conexão Robusta] Tentativa ${attempt + 1}/${delays.length} falhou: ${errorMsg}`);

        if (attempt < delays.length - 1) {
          logger.info(`[Conexão Robusta] Próxima tentativa em ${delays[attempt] / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        } else {
          logger.warn(`[Conexão Robusta] Todas as ${delays.length} tentativas falharam.`);
          logger.warn(`   O evento 'ready' pode ainda disparar. Aguardando...`);
          // Não lançar erro -deixar o evento 'ready' como fallback
          this.authenticatedProcessing = false;
        }
      }
    }
  }

  private setupEvents(): void {
    if (!this.client) return;

    // IMPORTANTE: Remover listeners antigos antes de adicionar novos
    // Isso evita listeners duplicados se setupEvents() for chamado múltiplas vezes
    this.client.removeAllListeners();
    logger.debug(`Eventos configurados para usuário ${this.userId} (listeners antigos removidos)`);

    // Log de todos os eventos para debug
    this.client.on('loading_screen', (percent, message) => {
      logger.info(`[WhatsApp Event] loading_screen para usuário ${this.userId}: ${percent}% - ${message}`);
    });

    this.client.on('change_state', (state) => {
      logger.info(`[WhatsApp Event] change_state para usuário ${this.userId}: ${state}`);
    });

    // QR Code recebido
    this.client.on('qr', async (qr) => {
      // ✅ CRÍTICO: Ignorar QR code se já estiver conectado
      // Isso previne múltiplas conexões que causam LOGOUT
      if (this.isClientReady) {
        logger.warn(`⚠️ [QR Event Protection] QR Code ignorado -cliente já está pronto (isClientReady=true) para usuário ${this.userId}`);
        logger.warn(`⚠️ [QR Event Protection] Isso previne múltiplas conexões. Se você realmente precisa reconectar, desconecte primeiro.`);
        return;
      }

      // ✅ NOVO: Verificar estado do cliente ANTES de processar QR
      try {
        if (this.client) {
          const clientState = await this.client.getState();
          const stateStr = String(clientState);

          // Se o cliente já está CONNECTED, PAIRING ou OPENING, ignorar QR
          if (stateStr === 'CONNECTED' || stateStr === 'PAIRING' || stateStr === 'OPENING') {
            logger.warn(`⚠️ [QR Event Protection] QR Code ignorado -cliente já está em estado ${stateStr} para usuário ${this.userId}`);
            logger.warn(`⚠️ [QR Event Protection] O cliente já está conectando/conectado. Ignorando QR code.`);
            return;
          }
        }
      } catch (error: any) {
        logger.warn(`⚠️ [QR Event Protection] Erro ao verificar estado do cliente: ${error.message}. Continuando...`);
      }

      logger.info(`QR Code recebido para usuário ${this.userId}`);
      logger.warn(`⚠️  QR Code gerado -isso significa que a sessão existente não foi reutilizada. Verifique se a sessão está ativa no WhatsApp.`);

      // Limpar timeout anterior se existir
      if (this.qrCodeTimeout) {
        clearTimeout(this.qrCodeTimeout);
        this.qrCodeTimeout = null;
      }

      // Gerar QR Code em texto para exibição
      qrcode.generate(qr, { small: true });

      // Guardar QR code em memória para acesso imediato
      this.lastQRCode = qr;

      try {
        // ✅ CRÍTICO: Verificar status atual antes de atualizar
        // NÃO mudar de 'connected' ou 'authenticated' para 'connecting'
        const currentSession = await this.sessionModel.findByUserId(this.userId);

        if (currentSession && (currentSession.status === 'connected' || currentSession.status === 'authenticated')) {
          logger.warn(`⚠️ [QR Event Protection] QR Code ignorado -sessão já está ${currentSession.status} para usuário ${this.userId}`);
          logger.warn(`⚠️ [QR Event Protection] Evitando mudança de status que causaria múltiplas conexões.`);
          return;
        }

        // ✅ NOVO: Verificar novamente após um pequeno delay para evitar condição de corrida
        // Se o evento 'ready' acabou de atualizar o status, aguardar um pouco e verificar novamente
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

        const currentSessionAfterDelay = await this.sessionModel.findByUserId(this.userId);
        if (currentSessionAfterDelay && (currentSessionAfterDelay.status === 'connected' || currentSessionAfterDelay.status === 'authenticated')) {
          logger.warn(`⚠️ [QR Event Protection] QR Code ignorado após delay -sessão já está ${currentSessionAfterDelay.status} para usuário ${this.userId}`);
          logger.warn(`⚠️ [QR Event Protection] O evento 'ready' provavelmente acabou de atualizar o status. Ignorando QR code.`);
          return;
        }

        // ✅ ALTERAÇÃO: NÃO atualizar status para 'connecting' apenas por gerar QR code
        // O status só será alterado quando o usuário escanear o QR code (evento 'authenticated')
        // Apenas salvar o QR code no banco, mantendo o status atual
        const currentStatus = currentSessionAfterDelay?.status || currentSession?.status || 'connection_failed';

        // Salvar QR Code no banco de dados (sem alterar status)
        const updated = await this.sessionModel.updateByUserId(this.userId, {
          qr_code: qr,
          // ✅ NÃO alterar status -manter status atual
          // status: 'connecting', // REMOVIDO -não faz sentido mudar status apenas por gerar QR
        });

        if (updated) {
          logger.debug(`QR Code salvo no banco para usuário ${this.userId} (status mantido como: ${currentStatus})`);
        } else {
          // Sessão não encontrada -usar getOrCreateSession para garantir que existe
          logger.warn(`Sessão não encontrada para usuário ${this.userId} -garantindo criação...`);
          await this.sessionModel.getOrCreateSession(this.userId);
          // Tentar atualizar novamente
          await this.sessionModel.updateByUserId(this.userId, {
            qr_code: qr,
            // ✅ NÃO alterar status -manter status atual
            // status: 'connecting', // REMOVIDO
          });
        }
      } catch (error: any) {
        logger.error(`Erro ao salvar QR code: ${error.message}`);
      }

      // Configurar timeout para limpar QR code após 2 minutos (tempo de expiração típico)
      // IMPORTANTE: O whatsapp-web.js pode não gerar um novo QR code automaticamente
      // Vamos verificar após a expiração e forçar reinicialização se necessário
      this.qrCodeTimeout = setTimeout(async () => {
        logger.warn(`QR Code expirado para usuário ${this.userId} -aguardando novo QR code...`);

        // Limpar QR code antigo do banco e da memória
        this.lastQRCode = null;

        try {
          await this.sessionModel.updateByUserId(this.userId, {
            qr_code: undefined,
            // ✅ NÃO alterar status -manter status atual
            // status: 'connecting', // REMOVIDO -não faz sentido mudar status apenas por QR expirar
          });

          // Emitir evento para frontend limpar QR code expirado
          this.emit('qr_expired');

          // IMPORTANTE: Aguardar 15 segundos para ver se o whatsapp-web.js gera um novo QR code automaticamente
          // Se não gerar, vamos forçar a reinicialização do cliente
          setTimeout(async () => {
            // Verificar se um novo QR code foi gerado
            if (!this.lastQRCode && this.client && !this.isClientReady) {
              try {
                const state = await this.client.getState();
                logger.warn(`⚠️ QR Code expirado há mais de 15 segundos e nenhum novo QR code foi gerado para usuário ${this.userId}`);
                logger.warn(`Estado do cliente: ${state}`);

                // Se o cliente ainda está aguardando autenticação (UNPAIRED, UNKNOWN), 
                // vamos forçar a reinicialização para gerar um novo QR code
                const stateStr = String(state);
                if (stateStr === 'UNPAIRED' || stateStr === 'UNKNOWN' || stateStr === 'CONFLICT') {
                  logger.info(`🔄 Forçando reinicialização do cliente para gerar novo QR code...`);

                  try {
                    // Destruir cliente atual
                    if (this.client) {
                      await this.client.destroy();
                      this.client = null;
                    }

                    // Limpar flags
                    this.isInitialized = false;
                    this.isClientReady = false;

                    // Aguardar um pouco antes de reinicializar
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Reinicializar o cliente (isso deve gerar um novo QR code)
                    logger.info(`🔄 Reinicializando cliente para usuário ${this.userId}...`);
                    await this.initialize();
                    logger.info(`✅ Cliente reinicializado. Aguardando novo QR code...`);
                  } catch (reinitError: any) {
                    logger.error(`❌ Erro ao reinicializar cliente após expiração do QR code: ${reinitError.message}`);
                    logger.error(`Stack: ${reinitError.stack}`);
                  }
                } else {
                  logger.info(`Cliente em estado ${state}. Aguardando mais um pouco antes de tomar ação...`);
                }
              } catch (error: any) {
                logger.warn(`Erro ao verificar estado do cliente após expiração do QR code: ${error.message}`);
              }
            } else if (this.lastQRCode) {
              logger.info(`✅ Novo QR code foi gerado automaticamente após expiração`);
            } else if (this.isClientReady) {
              logger.info(`✅ Cliente foi autenticado após expiração do QR code`);
            }
          }, 15000); // Aguardar 15 segundos após expiração

        } catch (error: any) {
          logger.error(`Erro ao limpar QR code expirado: ${error.message}`);
        }
      }, 2 * 60 * 1000); // 2 minutos

      // Emitir evento para Socket.IO
      this.emit('qr', qr);
    });

    // Autenticação bem-sucedida
    this.client.on('authenticated', async () => {
      // ✅ CRÍTICO: Ignorar se já estiver pronto para evitar múltiplas conexões
      if (this.isClientReady) {
        logger.warn(`⚠️ [Authenticated Event Protection] Evento 'authenticated' ignorado -cliente já está pronto para usuário ${this.userId}`);
        return;
      }

      // Evitar processamento duplicado se o evento for disparado múltiplas vezes
      if (this.authenticatedProcessing) {
        logger.warn(`Evento 'authenticated' já está sendo processado para usuário ${this.userId}, ignorando chamada duplicada`);
        return;
      }

      this.authenticatedProcessing = true;
      logger.info(`✅ WhatsApp autenticado para usuário ${this.userId}`);
      logger.info(`[WhatsApp Event] authenticated -Aguardando evento 'ready'...`);

      try {
        // IMPORTANTE: Capturar e salvar session_data como backup
        // Tentar obter informações da sessão do cliente
        let sessionData: string | null = null;
        try {
          // O LocalAuth gerencia os arquivos, mas podemos salvar metadados
          const sessionCheck = this.checkLocalAuthSessionFiles();
          sessionData = JSON.stringify({
            authenticated_at: new Date().toISOString(),
            session_path: sessionCheck.path,
            files_count: sessionCheck.count,
            has_valid_files: sessionCheck.exists
          });
          logger.debug(`[Session Data] Dados de sessão capturados para usuário ${this.userId}: ${sessionData}`);
        } catch (error: any) {
          logger.warn(`[Session Data] Erro ao capturar dados de sessão: ${error.message}`);
        }

        await this.sessionModel.updateByUserId(this.userId, {
          status: 'connecting', // ✅ AGORA sim mudamos para 'connecting' quando o usuário ESCANEAR o QR code
          qr_code: undefined,
          session_data: sessionData || '', // Salvar dados de sessão como backup
        });

        this.lastQRCode = null; // Limpar QR code da memória

        // Limpar timeout de QR code se existir
        if (this.qrCodeTimeout) {
          clearTimeout(this.qrCodeTimeout);
          this.qrCodeTimeout = null;
        }

        logger.info(`[Session Data] Dados de sessão salvos no banco para usuário ${this.userId}`);
        this.emit('authenticated');

        // 🚀 SOLUÇÃO: Detecção robusta de conexão (não depende do evento 'ready')
        // Baseado em pesquisa: https://github.com/Julzk/whatsapp-web.js/tarball/jkr_hotfix_7
        logger.info(`🔍 [Conexão Robusta] Iniciando detecção alternativa de conexão...`);
        this.waitForConnectionReady().catch(err => {
          logger.error(`Erro na detecção robusta: ${err.message}`);
        });
      } catch (error: any) {
        logger.error(`Erro ao processar evento 'authenticated' para usuário ${this.userId}: ${error.message}`);
        this.authenticatedProcessing = false; // Resetar flag em caso de erro
      }
    });

    // Falha na autenticação
    this.client.on('auth_failure', async (msg) => {
      logger.error(`Falha na autenticação WhatsApp para usuário ${this.userId}: ${msg}`);

      await this.sessionModel.updateByUserId(this.userId, {
        status: 'connection_failed', // Falha de autenticação é problema técnico
        qr_code: undefined,
      });

      this.emit('auth_failure', msg);
    });

    // Cliente pronto
    // IMPORTANTE: Usar flag de instância para evitar processamento duplicado
    // A flag já está declarada como propriedade de instância
    this.client.on('ready', async () => {
      logger.info(`[WhatsApp Event] ready recebido para usuário ${this.userId}`);

      // Evitar processamento duplicado se o evento for disparado múltiplas vezes
      if (this.readyProcessing) {
        logger.warn(`Evento 'ready' já está sendo processado para usuário ${this.userId}, ignorando chamada duplicada`);
        return;
      }

      this.readyProcessing = true;
      logger.info(`✅ WhatsApp cliente pronto para usuário ${this.userId}`);

      try {
        // IMPORTANTE: Verificar estado do cliente imediatamente
        let clientState: string = 'UNKNOWN';
        try {
          if (this.client) {
            const state = await this.client.getState();
            clientState = String(state);
            logger.info(`[Ready Event] Estado do cliente imediatamente após 'ready': ${clientState}`);
          } else {
            logger.warn(`[Ready Event] Cliente é null, não é possível obter estado`);
          }
        } catch (error: any) {
          logger.warn(`[Ready Event] Erro ao obter estado do cliente: ${error.message}`);
        }

        // IMPORTANTE: Para sessões reutilizadas, pode não ser necessário aguardar 30 segundos
        // Verificar se é uma sessão reutilizada (já estava autenticada antes)
        const isReusedSession = clientState === 'CONNECTED' || clientState === 'OPENING';

        if (isReusedSession) {
          logger.info(`[Ready Event] Sessão reutilizada detectada (estado: ${clientState}). Reduzindo tempo de sincronização para 5 segundos...`);
          // Para sessões reutilizadas, aguardar apenas 5 segundos
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          // IMPORTANTE: Aguardar sincronização completa antes de marcar como pronto
          // O WhatsApp ainda está sincronizando dados após o evento 'ready'
          // Aguardar 30 segundos para garantir que a sincronização seja concluída
          logger.info(`Aguardando sincronização completa do WhatsApp para usuário ${this.userId} (30 segundos)...`);
          logger.info(`⚠️ IMPORTANTE: Mantenha o WhatsApp aberto no dispositivo durante a sincronização!`);

          // Aguardar 30 segundos antes de marcar como totalmente pronto
          // Verificar a cada 5 segundos se o cliente ainda está conectado
          for (let i = 0; i < 6; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Verificar se o cliente ainda está conectado
            if (!this.client || !this.isInitialized) {
              logger.warn(`Cliente desconectado durante sincronização para usuário ${this.userId}. Abortando...`);
              this.readyProcessing = false; // Resetar flag
              return;
            }

            // Verificar estado do cliente
            try {
              const state = await this.client.getState();
              const stateStr = String(state);
              logger.debug(`[Ready Event] Estado do cliente durante sincronização (${i + 1}/6): ${stateStr}`);
              if (stateStr === 'LOGOUT' || stateStr === 'UNPAIRED') {
                logger.warn(`Cliente em estado inválido durante sincronização para usuário ${this.userId}: ${state}. Abortando...`);
                this.readyProcessing = false; // Resetar flag
                return;
              }
            } catch (error: any) {
              logger.warn(`Erro ao verificar estado do cliente durante sincronização: ${error.message}. Continuando...`);
            }
          }
        }

        // Verificar uma última vez se o cliente ainda está conectado antes de marcar como pronto
        if (!this.client || !this.isInitialized) {
          logger.warn(`Cliente desconectado após sincronização para usuário ${this.userId}. Não marcando como pronto.`);
          this.readyProcessing = false; // Resetar flag
          return;
        }

        // Verificar estado final do cliente
        try {
          const finalState = await this.client.getState();
          logger.info(`[Ready Event] Estado final do cliente antes de marcar como pronto: ${String(finalState)}`);
        } catch (error: any) {
          logger.warn(`[Ready Event] Erro ao obter estado final do cliente: ${error.message}`);
        }

        logger.info(`Sincronização concluída para usuário ${this.userId}. Marcando como pronto...`);

        // Marcar cliente como pronto APÓS a sincronização
        this.isClientReady = true;
        logger.info(`✅ isClientReady definido como TRUE para usuário ${this.userId}`);

        try {
          // IMPORTANTE: Capturar e salvar todas as informações necessárias para reconexão
          const now = new Date();
          let sessionData: string | null = null;
          let sessionFilesPath: string | null = null;

          try {
            const sessionCheck = this.checkLocalAuthSessionFiles();
            const clientState = await this.client.getState();

            // Salvar caminho dos arquivos de sessão
            sessionFilesPath = sessionCheck.path;

            // Capturar dados detalhados da sessão
            sessionData = JSON.stringify({
              ready_at: now.toISOString(),
              last_connected_at: now.toISOString(),
              client_state: clientState,
              session_path: sessionCheck.path,
              files_count: sessionCheck.count,
              has_valid_files: sessionCheck.exists,
              has_auth_files: sessionCheck.hasAuthFiles,
              has_default_profile: sessionCheck.hasDefaultProfile,
              auth_path: sessionCheck.authPath
            });
            logger.debug(`[Session Data] Dados de sessão capturados no evento 'ready' para usuário ${this.userId}: ${sessionData}`);
          } catch (error: any) {
            logger.warn(`[Session Data] Erro ao capturar dados de sessão no evento 'ready': ${error.message}`);
          }

          // Primeiro tentar atualizar a sessão existente
          let updated = await this.sessionModel.updateByUserId(this.userId, {
            status: 'connected',
            qr_code: undefined,
            session_data: sessionData || '',
            last_connected_at: now,
            last_ready_at: now,
            session_files_path: sessionFilesPath,
          });

          if (updated) {
            logger.debug(`✅ Status atualizado para 'connected' no banco para usuário ${this.userId}`);
            logger.info(`[Session Data] Dados de sessão salvos no banco para usuário ${this.userId}`);
          } else {
            // Sessão não encontrada -garantir que existe e atualizar
            logger.warn(`Sessão não encontrada para usuário ${this.userId} -garantindo criação e atualizando...`);
            try {
              await this.sessionModel.getOrCreateSession(this.userId);
              // Tentar atualizar novamente
              await this.sessionModel.updateByUserId(this.userId, {
                status: 'connected',
                qr_code: undefined,
                session_data: sessionData || '',
                last_connected_at: now,
                last_ready_at: now,
                session_files_path: sessionFilesPath,
              });
              logger.debug(`✅ Sessão atualizada para 'connected' para usuário ${this.userId}`);
            } catch (createError: any) {
              logger.error(`Erro ao criar/atualizar sessão para usuário ${this.userId}: ${createError.message}`);
            }
          }
        } catch (error: any) {
          logger.error(`Erro ao atualizar status para 'connected' para usuário ${this.userId}: ${error.message}`);
        }

        this.lastQRCode = null; // Limpar QR code da memória

        // Limpar timeout de QR code se existir
        if (this.qrCodeTimeout) {
          clearTimeout(this.qrCodeTimeout);
          this.qrCodeTimeout = null;
        }

        // Iniciar keep-alive para manter sessão ativa (APÓS sincronização)
        // Aguardar mais 10 segundos antes de iniciar keep-alive para não interferir
        // IMPORTANTE: Verificar se já não existe um keep-alive ativo
        if (!this.keepAliveInterval) {
          setTimeout(() => {
            // Verificar novamente antes de iniciar (pode ter sido iniciado por outra chamada)
            if (!this.keepAliveInterval) {
              this.startKeepAlive();
            } else {
              logger.debug(`Keep-alive já está ativo para usuário ${this.userId}, não iniciando duplicado`);
            }
          }, 10000);
        } else {
          logger.debug(`Keep-alive já está ativo para usuário ${this.userId}, não iniciando duplicado`);
        }

        logger.info(`✅ WhatsApp totalmente pronto e sincronizado para usuário ${this.userId}`);
        logger.info(`[Ready Event] Emitindo evento 'ready' para listeners externos...`);
        this.emit('ready');
        logger.info(`✅ Evento 'ready' processado com sucesso para usuário ${this.userId}. isClientReady=${this.isClientReady}`);
      } catch (error: any) {
        logger.error(`❌ Erro ao processar evento 'ready' para usuário ${this.userId}: ${error.message}`);
        logger.error(`Stack: ${error.stack}`);
        this.readyProcessing = false; // Resetar flag em caso de erro
        this.isClientReady = false; // Garantir que não fica marcado como pronto em caso de erro
      }
    });

    // Mensagem recebida -usar evento 'message' conforme exemplo oficial
    // https://wwebjs.dev/guide/creating-your-bot/#replying-to-messages
    this.client.on('message', async (msg: Message) => {
      // ⚠️ IMPORTANTE: Logar dados brutos ANTES de qualquer processamento ou filtro
      // Isso captura TUDO que chega, incluindo reações, mensagens de sistema, etc.
      try {
        WhatsAppRawMessageLogger.logIncomingMessage(msg, this.userId);
      } catch (error: any) {
        logger.error(`Erro ao logar mensagem raw: ${error.message}`);
      }

      // Processar apenas mensagens recebidas (não enviadas por nós)
      if (!msg.fromMe) {
        // NÃO USAR try/catch que pode ocultar erros críticos
        // Processar mensagem sem bloquear (setImmediate usado dentro de handleIncomingMessage)
        await this.handleIncomingMessage(msg).catch((error: any) => {
          logger.error(`Erro crítico ao processar mensagem recebida: ${error.message}`);
          logger.error(`Stack trace: ${error.stack}`);
          // NÃO lançar erro -apenas logar para evitar crash do cliente
        });
      }
    });

    // Mensagem criada (todas as mensagens, incluindo as enviadas por nós)
    // Usar message_create para capturar mensagens enviadas
    this.client.on('message_create', async (msg: Message) => {
      // Logar dados brutos de mensagens criadas também
      try {
        WhatsAppRawMessageLogger.logMessageEvent('message_create', msg, this.userId);
      } catch (error: any) {
        logger.error(`Erro ao logar message_create raw: ${error.message}`);
      }

      // Processar apenas mensagens enviadas por nós
      if (msg.fromMe) {
        await this.handleOutgoingMessage(msg).catch((error: any) => {
          logger.error(`Erro ao processar mensagem enviada: ${error.message}`);
          logger.error(`Stack trace: ${error.stack}`);
          // NÃO lançar erro -apenas logar para evitar crash do cliente
        });
      }
    });

    // Handler específico para message_reaction
    this.client.on('message_reaction', async (data: any) => {
      try {
        // Logar dados brutos ANTES de qualquer processamento
        WhatsAppRawMessageLogger.logMessageEvent('message_reaction', data, this.userId);

        // Log detalhado de TODAS as propriedades do evento para debug
        logger.debug(`[WhatsApp Event] message_reaction capturado para usuário ${this.userId}`, {
          allKeys: Object.keys(data || {}),
          hasId: !!data.id,
          hasReaction: !!data.reaction,
          hasEmoji: !!data.emoji,
          hasMsgId: !!data.msgId,
          hasSender: !!data.sender,
          hasTimestamp: !!data.timestamp,
          idKeys: data.id ? Object.keys(data.id) : null,
          idStructure: data.id,
          reactionValue: data.reaction,
          emojiValue: data.emoji,
          msgIdValue: data.msgId,
          fullData: JSON.stringify(data, (_key, value) => {
            if (typeof value === 'function') return '[Function]';
            return value;
          }, 2),
        });

        // Processar a reação
        // O evento message_reaction tem a seguinte estrutura:
        // -data.id: ID da própria reação (não usar para buscar mensagem)
        // -data.msgId: ID da mensagem que foi reagida (USAR ESTE!)
        // -data.reaction: emoji da reação
        // -data.senderId: quem reagiu (formato: "556181935443@c.us")
        // -data.timestamp: timestamp da reação
        if (data && data.reaction) {
          // Extrair informações da reação
          const reactionEmoji = data.reaction || '';

          // O ID da mensagem reagida está em data.msgId (NÃO em data.id!)
          // IMPORTANTE: No banco, o message_id é salvo como msg.id._serialized (formato completo)
          // Formato _serialized: {fromMe}_{remote}_{messageId}
          // Exemplo: "true_556181935443@c.us_3EB03155C12B7B4AEDDB4E"
          let reactedMessageId: string | null = null;
          let reactedMessageIdShort: string | null = null; // Versão curta para busca alternativa

          // Priorizar msgId sobre id (msgId é o ID da mensagem reagida)
          if (data.msgId?._serialized) {
            // Usar o _serialized completo primeiro (como está salvo no banco)
            // IMPORTANTE: Usar o valor COMPLETO "_serialized", não apenas o "id"
            reactedMessageId = data.msgId._serialized;
            logger.debug(`Usando msgId._serialized completo: "${reactedMessageId}"`);
            // Também extrair a versão curta para busca alternativa (caso necessário)
            const parts = data.msgId._serialized.split('_');
            if (parts.length >= 3) {
              reactedMessageIdShort = parts[2];
              logger.debug(`Versão curta extraída: "${reactedMessageIdShort}" (apenas para busca alternativa)`);
            }
          } else if (data.msgId?.id) {
            // Se não tiver _serialized, usar apenas o ID (fallback -não ideal)
            logger.warn(`msgId._serialized não encontrado, usando apenas msgId.id: "${data.msgId.id}"`);
            reactedMessageId = data.msgId.id;
            reactedMessageIdShort = data.msgId.id;
          } else if (data.id?._serialized) {
            // Fallback: tentar usar data.id se msgId não existir (versões antigas?)
            logger.warn('Usando data.id como fallback -msgId não encontrado');
            reactedMessageId = data.id._serialized;
            const parts = data.id._serialized.split('_');
            if (parts.length >= 3) {
              reactedMessageIdShort = parts[2];
            }
          } else if (data.id?.id) {
            // Fallback: usar apenas o ID
            reactedMessageId = data.id.id;
            reactedMessageIdShort = data.id.id;
          }

          // Quem reagiu: usar senderId primeiro, depois fallback para outras propriedades
          let reactedBy = '';
          if (data.senderId) {
            // senderId vem no formato "556181935443@c.us" ou "@lid"
            reactedBy = data.senderId.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
          } else if (data.id?.remote) {
            // Fallback: usar remote do id
            reactedBy = data.id.remote.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
          } else if (data.id?._serialized) {
            // Fallback: extrair do _serialized
            const parts = data.id._serialized.split('_');
            if (parts.length > 0) {
              const lastPart = parts[parts.length - 1];
              reactedBy = lastPart.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
            }
          }

          logger.debug(`Dados extraídos do message_reaction:`, {
            reactionEmoji,
            reactedMessageId,
            reactedMessageIdShort,
            reactedBy,
            msgIdStructure: data.msgId,
            idStructure: data.id,
            senderId: data.senderId,
          });

          if (reactedMessageId && reactedBy && reactionEmoji) {
            logger.info(`Processando reação do evento message_reaction: emoji=${reactionEmoji}, mensagem_reagida=${reactedMessageId}, reagido_por=${reactedBy}`);

            // IMPORTANTE: Agora que message_id na tabela reactions relaciona diretamente com message_id da tabela messages,
            // podemos salvar a reação diretamente usando o reactedMessageId (msgId._serialized) sem precisar buscar a mensagem primeiro.
            // A foreign key garantirá que a mensagem existe.

            // Tentar salvar diretamente primeiro (mais eficiente)
            // IMPORTANTE: reactedMessageId deve ser o _serialized completo (ex: "true_556181935443@c.us_3EB00E0AAA8910AC4A4E16")
            try {
              logger.debug(`Tentando salvar reação com message_id completo: "${reactedMessageId}"`);
              await this.saveReaction(reactedMessageId, reactionEmoji, reactedBy);
              logger.info(`Reação salva diretamente: ${reactionEmoji} na mensagem ${reactedMessageId}`);
            } catch (error: any) {
              // Se falhar (provavelmente foreign key constraint), a mensagem pode não estar no banco ainda
              if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.message?.includes('foreign key constraint')) {
                logger.debug(`Mensagem reagida não encontrada no banco (foreign key): ${reactedMessageId}. Aguardando mensagem chegar...`);

                // Tentar buscar a mensagem para confirmar
                let reactedMessage = await this.messageModel.findByMessageId(reactedMessageId);

                // Se não encontrou e temos uma versão curta, tentar buscar por ela também
                if (!reactedMessage && reactedMessageIdShort && reactedMessageIdShort !== reactedMessageId) {
                  logger.debug(`Tentando buscar mensagem com ID curto: ${reactedMessageIdShort}`);
                  reactedMessage = await this.messageModel.findByMessageId(reactedMessageIdShort);
                }

                if (!reactedMessage) {
                  // A mensagem pode não estar no banco ainda (pode ter sido enviada antes do sistema estar rodando)
                  // Vamos tentar novamente após um delay
                  setTimeout(async () => {
                    let retryMessage = await this.messageModel.findByMessageId(reactedMessageId);
                    if (!retryMessage && reactedMessageIdShort) {
                      retryMessage = await this.messageModel.findByMessageId(reactedMessageIdShort);
                    }
                    if (retryMessage && retryMessage.message_id) {
                      // Usar message_id (string) da mensagem encontrada
                      // IMPORTANTE: retryMessage.message_id deve ser o valor completo _serialized
                      logger.debug(`Mensagem encontrada no retry: message_id="${retryMessage.message_id}" (tamanho: ${retryMessage.message_id.length})`);
                      try {
                        await this.saveReaction(retryMessage.message_id, reactionEmoji, reactedBy);
                        logger.info(`Reação salva após retry: ${reactionEmoji} na mensagem ${retryMessage.message_id}`);
                      } catch (retryError: any) {
                        logger.error(`Erro ao salvar reação após retry: ${retryError.message}`);
                      }
                    } else {
                      logger.warn(`Mensagem reagida ainda não encontrada após retry: ${reactedMessageId} (também tentou: ${reactedMessageIdShort})`);
                    }
                  }, 2000); // Aguardar 2 segundos
                } else {
                  // Mensagem encontrada, tentar salvar novamente
                  if (reactedMessage.message_id) {
                    // IMPORTANTE: reactedMessage.message_id deve ser o valor completo _serialized
                    logger.debug(`Mensagem encontrada: message_id="${reactedMessage.message_id}" (tamanho: ${reactedMessage.message_id.length})`);
                    try {
                      await this.saveReaction(reactedMessage.message_id, reactionEmoji, reactedBy);
                      logger.info(`Reação salva após encontrar mensagem: ${reactionEmoji} na mensagem ${reactedMessage.message_id}`);
                    } catch (retryError: any) {
                      logger.error(`Erro ao salvar reação após encontrar mensagem: ${retryError.message}`);
                    }
                  }
                }
              } else {
                // Outro tipo de erro
                logger.error(`Erro ao salvar reação: ${error.message}`);
                throw error;
              }
            }
          } else {
            logger.debug('Evento message_reaction sem dados suficientes para processar:', {
              hasReaction: !!data.reaction,
              hasId: !!data.id,
              reactionEmoji,
              reactedMessageId,
              reactedBy,
              fullData: JSON.stringify(data),
            });
          }
        }
      } catch (error: any) {
        logger.error(`Erro ao processar evento message_reaction: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
      }
    });

    // Capturar outros eventos relacionados a mensagens
    if (this.client) {
      const messageRelatedEvents = [
        'message_revoke_everyone',
        'message_revoke_me',
        'message_edit',
      ];

      messageRelatedEvents.forEach((eventName) => {
        this.client!.on(eventName as any, (data: any) => {
          try {
            WhatsAppRawMessageLogger.logMessageEvent(eventName, data, this.userId);
            logger.debug(`[WhatsApp Event] ${eventName} capturado para usuário ${this.userId}`);
          } catch (error: any) {
            logger.error(`Erro ao logar evento ${eventName}: ${error.message}`);
          }
        });
      });

      // Handler específico para message_ack
      this.client.on('message_ack', async (data: any) => {
        try {
          WhatsAppRawMessageLogger.logMessageEvent('message_ack', data, this.userId);

          logger.debug(`[WhatsApp Event] message_ack capturado para usuário ${this.userId}`, {
            hasData: !!data,
            has_data: !!data._data,
            ack: data._data?.ack,
            hasId: !!data.id,
            idStructure: data.id,
          });

          // Extrair ack status: 1 = recebida, 2 = lida
          const ackStatus = data._data?.ack;

          if (ackStatus !== 1 && ackStatus !== 2) {
            logger.debug(`Ack status inválido ou não presente: ${ackStatus}`);
            return;
          }

          // Extrair message_id da mensagem
          let messageId: string | null = null;

          if (data.id?._serialized) {
            messageId = data.id._serialized;
          } else if (data.id?.id) {
            messageId = data.id.id;
          } else if (data._data?.id?._serialized) {
            messageId = data._data.id._serialized;
          } else if (data._data?.id?.id) {
            messageId = data._data.id.id;
          }

          if (!messageId) {
            logger.warn(`Não foi possível extrair message_id do evento message_ack:`, {
              dataKeys: Object.keys(data || {}),
              idKeys: data.id ? Object.keys(data.id) : null,
              _dataKeys: data._data ? Object.keys(data._data) : null,
            });
            return;
          }

          logger.info(`Processando message_ack: message_id=${messageId}, ack=${ackStatus} (${ackStatus === 1 ? 'recebida' : 'lida'})`);

          // Atualizar status de ack no banco de dados
          await this.messageModel.updateAckStatus(messageId, ackStatus);

          logger.info(`Status de ack atualizado: message_id=${messageId}, ack=${ackStatus}`);

          // Buscar a mensagem atualizada para obter os timestamps corretos
          const updatedMessage = await this.messageModel.findByMessageId(messageId);

          // Emitir evento para o frontend
          this.emit('message_ack', {
            messageId: messageId,
            ack: ackStatus,
            receivedAt: updatedMessage?.received_at ? updatedMessage.received_at.toISOString() : (ackStatus === 1 ? new Date().toISOString() : null),
            readAt: updatedMessage?.read_at ? updatedMessage.read_at.toISOString() : (ackStatus === 2 ? new Date().toISOString() : null),
          });
        } catch (error: any) {
          logger.error(`Erro ao processar evento message_ack: ${error.message}`);
          logger.error(`Stack trace: ${error.stack}`);
        }
      });
    }

    // Desconectado
    this.client.on('disconnected', async (reason) => {
      logger.warn(`WhatsApp desconectado para usuário ${this.userId}: ${reason}`);

      // Resetar flags de processamento
      this.readyProcessing = false;
      this.authenticatedProcessing = false;

      // Marcar cliente como não pronto
      this.isClientReady = false;
      this.isInitialized = false;

      // Determinar o status baseado na razão da desconexão
      // 'disconnected' = APENAS desconexão manual (LOGOUT)
      // 'connection_failed' = Falha técnica (rede, timeout, etc.)
      const isManualLogout = reason === 'LOGOUT';
      const newStatus = isManualLogout ? 'disconnected' : 'connection_failed';

      try {
        await this.sessionModel.updateByUserId(this.userId, {
          status: newStatus,
        });
        logger.info(`Status atualizado para '${newStatus}' para usuário ${this.userId}`);
      } catch (error: any) {
        logger.error(`Erro ao atualizar status para '${newStatus}': ${error.message}`);
      }

      this.emit('disconnected', reason);

      if (isManualLogout) {
        // LOGOUT = Desconexão manual pelo usuário
        // Parar keep-alive e aguardar ação manual
        this.stopKeepAlive();

        logger.warn(`LOGOUT detectado para usuário ${this.userId}. Desconexão manual.`);
        logger.warn(`Isso indica que o usuário desconectou manualmente no dispositivo móvel ou ocorreu conflito de múltiplas conexões.`);
        logger.info(`Para reconectar, o usuário deve clicar em "Conectar WhatsApp" na interface.`);

        // Aguardar antes de permitir nova inicialização
        logger.info(`Aguardando 60 segundos antes de permitir nova inicialização após LOGOUT...`);
        setTimeout(() => {
          logger.info(`Período de espera após LOGOUT concluído para usuário ${this.userId}. Nova inicialização permitida.`);
        }, 60000);
      } else {
        // Falha técnica -NÃO parar keep-alive, continuar tentando
        logger.warn(`Falha técnica de conexão para usuário ${this.userId} (razão: ${reason}).`);
        logger.info(`Keep-alive continuará tentando reconectar a cada 15 minutos.`);

        // Reiniciar keep-alive se não estiver ativo
        if (!this.keepAliveInterval) {
          this.startKeepAlive();
        }
      }
    });

    // Estado mudou
    this.client.on('change_state', async (state) => {
      logger.info(`Estado WhatsApp mudou para usuário ${this.userId}: ${state}`);
      this.emit('state_changed', state);
    });

    // Carregando tela
    this.client.on('loading_screen', (percent, message) => {
      logger.debug(`Carregando WhatsApp: ${percent}% - ${message}`);
      this.emit('loading', { percent, message });
    });
  }

  /**
   * Processa uma reação recebida
   */
  private async processReaction(msg: Message): Promise<void> {
    try {
      const msgData = (msg as any)._data || {};

      // Extrair informações da reação
      // A reação pode estar em diferentes lugares dependendo da versão do whatsapp-web.js
      let reactionData = msgData.reactionMessage || msgData.react || msgData.reaction;

      // Se não encontrou, tentar outras propriedades possíveis
      if (!reactionData) {
        // Tentar buscar em outras estruturas possíveis
        if (msgData.msgContext?.reactionMessage) {
          reactionData = msgData.msgContext.reactionMessage;
        } else if (msgData.quotedMsg?.reactionMessage) {
          reactionData = msgData.quotedMsg.reactionMessage;
        }
      }

      if (!reactionData) {
        logger.debug('Reação detectada mas sem dados de reação disponíveis. Estrutura da mensagem:', {
          hasReaction: msg.hasReaction,
          keys: Object.keys(msgData),
          type: msg.type,
        });
        return;
      }

      // ID da mensagem que foi reagida
      // Pode estar em diferentes formatos
      let reactedMessageId = null;
      if (reactionData.key) {
        // Formato: { key: { id: "...", fromMe: true, remote: "..." } }
        reactedMessageId = reactionData.key.id || reactionData.key.remote;
      } else if (reactionData.msgId) {
        reactedMessageId = reactionData.msgId;
      } else if (reactionData.messageId) {
        reactedMessageId = reactionData.messageId;
      } else if (typeof reactionData === 'string') {
        // Se reactionData é uma string, pode ser o ID direto
        reactedMessageId = reactionData;
      }

      if (!reactedMessageId) {
        logger.debug('Reação sem ID da mensagem reagida. reactionData:', JSON.stringify(reactionData));
        return;
      }

      // Emoji da reação
      const reactionEmoji = reactionData.text || reactionData.emoji || reactionData.reactionText || '👍'; // Padrão: thumbs up

      // Quem reagiu
      const reactedBy = msg.from ? msg.from.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '') : '';
      if (!reactedBy) {
        logger.debug('Reação sem identificação de quem reagiu');
        return;
      }

      logger.info(`Processando reação: emoji=${reactionEmoji}, mensagem_reagida=${reactedMessageId}, reagido_por=${reactedBy}`);

      // Buscar a mensagem que foi reagida no banco de dados
      const reactedMessage = await this.messageModel.findByMessageId(reactedMessageId);

      if (!reactedMessage) {
        logger.debug(`Mensagem reagida não encontrada no banco: ${reactedMessageId}. Aguardando mensagem chegar...`);
        // A mensagem pode não estar no banco ainda (pode ter sido enviada antes do sistema estar rodando)
        // Vamos tentar novamente após um delay
        setTimeout(async () => {
          const retryMessage = await this.messageModel.findByMessageId(reactedMessageId);
          if (retryMessage && retryMessage.message_id) {
            // Usar message_id (string) da mensagem encontrada
            await this.saveReaction(retryMessage.message_id, reactionEmoji, reactedBy);
          } else {
            logger.warn(`Mensagem reagida ainda não encontrada após retry: ${reactedMessageId}`);
          }
        }, 2000); // Aguardar 2 segundos
        return;
      }

      // Usar message_id (string) da mensagem encontrada, não o id (number)
      if (reactedMessage.message_id) {
        await this.saveReaction(reactedMessage.message_id, reactionEmoji, reactedBy);
      } else {
        logger.error(`Mensagem encontrada mas sem message_id: id=${reactedMessage.id}`);
      }
    } catch (error: any) {
      logger.error(`Erro ao processar reação: ${error.message}`);
      logger.error(`Stack: ${error.stack}`);
    }
  }

  /**
   * Salva uma reação no banco de dados
   * @param messageIdString -message_id da mensagem (data.msgId._serialized) -VARCHAR(100)
   * @param reactionEmoji -emoji da reação
   * @param reactedBy -número do contato que reagiu
   */
  private async saveReaction(
    messageIdString: string,
    reactionEmoji: string,
    reactedBy: string
  ): Promise<void> {
    try {
      logger.debug(`Tentando salvar reação: message_id="${messageIdString}" (tamanho: ${messageIdString.length}), emoji="${reactionEmoji}", reactedBy="${reactedBy}"`);

      // Verificar se a reação já existe
      const existingReaction = await this.reactionModel.findByMessageAndReactedBy(
        messageIdString,
        reactedBy
      );

      logger.debug(`Reação existente encontrada: ${existingReaction ? 'sim' : 'não'}`);

      if (existingReaction) {
        // Se a reação já existe e o emoji é diferente, atualizar
        if (existingReaction.reaction_emoji !== reactionEmoji) {
          // Remover reação antiga e criar nova
          await this.reactionModel.delete(existingReaction.id);
          await this.reactionModel.create({
            message_id: messageIdString,
            reaction_emoji: reactionEmoji,
            reacted_by: reactedBy,
          });
          logger.info(`Reação atualizada: ${existingReaction.reaction_emoji} -> ${reactionEmoji}`);
        } else {
          logger.debug('Reação já existe com o mesmo emoji');
        }
      } else {
        // Criar nova reação
        await this.reactionModel.create({
          message_id: messageIdString,
          reaction_emoji: reactionEmoji,
          reacted_by: reactedBy,
        });
        logger.info(`Reação salva: ${reactionEmoji} na mensagem ${messageIdString}`);
      }

      // Emitir evento para atualizar o frontend
      this.emit('reaction', {
        messageId: messageIdString,
        reactionEmoji: reactionEmoji,
        reactedBy: reactedBy,
      });
    } catch (error: any) {
      logger.error(`Erro ao salvar reação: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extrai informações de contato (número e nome) de forma inteligente
   * Lida com o novo formato @lid do WhatsApp para descobrir o número real
   */
  private async getContactInfo(msg: Message): Promise<{ contactNumber: string; contactName: string; lid?: string | null }> {
    const msgData = (msg as any)._data || {};
    let rawIdentifier = msg.from || '';

    // Para mensagens enviadas, o identificador pode estar no 'to'
    if (msg.fromMe && msg.to) {
      rawIdentifier = msg.to;
    }

    let lid: string | null = null;
    let contactNumber = '';
    let contactName = '';

    // Se o identificador for LID, salvar
    if (rawIdentifier.includes('@lid')) {
      lid = rawIdentifier;
    }

    // 1. Limpeza básica inicial
    contactNumber = rawIdentifier
      .replace('@c.us', '')
      .replace('@s.whatsapp.net', '')
      .replace('@g.us', '')
      .replace('@lid', '');

    // 2. Tentar obter nome do notifyName (mais confiável para nome de perfil)
    contactName = msgData.notifyName || contactNumber;

    // 3. SE for um identificador @lid, tentar recuperar o número real
    if (rawIdentifier.includes('@lid')) {
      logger.debug(`[LID Detection] Identificador @lid detectado: ${lid}. Tentando recuperar número real...`);

      try {
        // Tentar via getChatById (mais estável que getContactById atualmente)
        const chat = await this.client!.getChatById(rawIdentifier);

        if (chat && chat.name) {
          // Extrair apenas números do nome do chat
          const digitsInName = chat.name.replace(/\D/g, '');

          // Se tiver 10 ou mais dígitos, é muito provável que seja o número real
          if (digitsInName.length >= 10) {
            logger.info(`[LID Recovery] SUCESSO! Número real encontrado no nome do chat: ${digitsInName}`);
            contactNumber = digitsInName;

            // Se o nome original do chat tiver letras, é um nome real, senão usamos o número
            if (/[a-zA-Z]/.test(chat.name)) {
              contactName = chat.name;
            } else {
              contactName = digitsInName;
            }
          } else {
            logger.debug(`[LID Recovery] Nome do chat não parece conter um número: ${chat.name}`);
            // Se não encontrou número, contactNumber já é o ID do LID sem sufixo (fallback)
            // contactNumber já está limpo acima
            if (chat.name && !chat.name.includes('@')) {
              contactName = chat.name;
            }
          }
        }
      } catch (error: any) {
        logger.warn(`[LID Recovery] Erro ao tentar recuperar via chat: ${error.message}`);
        // contactNumber já é o ID do LID sem sufixo (fallback)
      }
    }

    return { contactNumber, contactName, lid };
  }

  /**
   * Detecta o tipo de mensagem baseado nas propriedades do objeto Message
   */
  private detectMessageType(msg: Message): 'text' | 'audio' | 'media' | 'reaction' | 'system' | 'location' | 'contact' | 'other' {
    try {
      // Verificar se é reação (hasReaction ou propriedades de reação)
      const msgData = (msg as any)._data || {};
      if (msgData.reactionMessage || msg.hasReaction || msgData.react) {
        return 'reaction';
      }

      // Verificar se tem mídia (áudio/PTT tratado como tipo 'audio' para transcrição)
      const msgType = msg.type || msgData.type;
      if (msg.hasMedia) {
        const t = msgType ? String(msgType).toLowerCase() : '';
        if (t === 'ptt' || t === 'audio') return 'audio';
        return 'media';
      }

      // Verificar tipo específico
      if (msgType) {
        switch (String(msgType).toLowerCase()) {
          case 'location':
            return 'location';
          case 'vcard':
          case 'contact':
            return 'contact';
          case 'system':
            return 'system';
          case 'image':
          case 'video':
          case 'document':
          case 'sticker':
            return 'media';
        }
      }

      // Verificar se tem localização
      if (msg.location) {
        return 'location';
      }

      // Verificar se tem contato
      if (msg.vCards && msg.vCards.length > 0) {
        return 'contact';
      }

      // Se não tem body ou está vazio, pode ser reação ou sistema
      if (!msg.body || msg.body.trim() === '') {
        // Se tem alguma propriedade especial, classificar como 'other'
        if (msgData.isNotification || msgData.isEphemeral) {
          return 'system';
        }
        // Caso contrário, assumir que é reação (mais comum)
        return 'reaction';
      }

      // Mensagem de texto normal
      return 'text';
    } catch (error: any) {
      logger.warn(`Erro ao detectar tipo de mensagem: ${error.message}. Usando 'text' como padrão.`);
      return 'text';
    }
  }

  /**
   * Delay em ms para agrupar mensagens do cliente (debounce). 0 = processar imediatamente.
   */
  private getDebounceMs(): number {
    const ms = parseInt(process.env.MESSAGE_DEBOUNCE_MS || '4000', 10);
    return Number.isNaN(ms) || ms < 0 ? 4000 : ms;
  }

  /**
   * Determina a extensão de arquivo a partir do mimetype
   */
  private getExtFromMimetype(mimetype: string): string {
    const map: Record<string, string> = {
      'audio/ogg': '.ogg',
      'audio/ogg; codecs=opus': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'audio/aac': '.aac',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/3gpp': '.3gp',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    };
    const base = mimetype ? mimetype.split(';')[0].trim() : '';
    return map[base] || map[mimetype] || '';
  }

  /**
   * Salva mídia recebida de um cliente em disco e cria registro na tabela medias.
   * Retorna o ID do registro criado ou null em caso de falha.
   */
  private async saveIncomingMedia(
    buffer: Buffer,
    mimetype: string,
    originalFilename?: string
  ): Promise<number | null> {
    try {
      const { MediaModel } = await import('../models/media.model');
      const incomingDir = path.join(process.cwd(), 'uploads', 'incoming');
      if (!fs.existsSync(incomingDir)) {
        fs.mkdirSync(incomingDir, { recursive: true });
      }

      const ext = this.getExtFromMimetype(mimetype);
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
      const filePath = path.join(incomingDir, uniqueName);

      fs.writeFileSync(filePath, buffer);

      // Determinar file_type a partir do mimetype
      let fileType: 'audio' | 'video' | 'image' | 'document' = 'document';
      const mimeBase = mimetype ? mimetype.split(';')[0].trim() : '';
      if (mimeBase.startsWith('audio/')) fileType = 'audio';
      else if (mimeBase.startsWith('video/')) fileType = 'video';
      else if (mimeBase.startsWith('image/')) fileType = 'image';

      const mediaModel = new MediaModel();
      const created = await mediaModel.create({
        user_id: this.userId,
        filename: originalFilename || uniqueName,
        file_path: filePath,
        file_type: fileType,
        source: 'incoming',
        file_size: buffer.length,
        title: originalFilename || uniqueName,
        description: '',
        status: 'completed',
        is_active: false,
        mandatory_send: false,
        indexing_status: 'pending',
      });

      logger.info(`Mídia recebida salva: id=${created.id}, tipo=${fileType}, tamanho=${buffer.length} bytes`);
      return created.id;
    } catch (err: any) {
      logger.warn(`Não foi possível salvar mídia recebida (migration pendente?): ${err.message}`);
      return null;
    }
  }

  private async handleIncomingMessage(msg: Message): Promise<void> {
    try {
      // Ignorar mensagens de status
      if (msg.isStatus) {
        logger.debug('Mensagem de status ignorada');
        return;
      }

      // Ignorar mensagens de grupos (por enquanto)
      if (msg.from.includes('@g.us')) {
        logger.debug('Mensagem de grupo ignorada');
        return;
      }

      // Detectar tipo de mensagem
      const messageType = this.detectMessageType(msg);

      // Processar reações separadamente
      if (messageType === 'reaction') {
        logger.debug(`Processando reação de ${msg.from}`);
        await this.processReaction(msg);
        return; // Não processar reação como mensagem normal
      }

      // Ignorar mensagens de sistema sem conteúdo relevante
      if (messageType === 'system' && (!msg.body || msg.body.trim() === '')) {
        logger.debug('Mensagem de sistema sem conteúdo ignorada');
        return;
      }

      // Extrair número e nome do contato de forma inteligente (lidando com @lid)
      const { contactNumber, contactName, lid } = await this.getContactInfo(msg);

      if (!contactNumber) {
        logger.warn(`Não foi possível extrair número do contato da mensagem. msg.from=${msg.from}`);
        return;
      }

      // Preparar conteúdo para log e salvamento (áudios serão transcritos abaixo)
      let messageBody = msg.body || '';
      let incomingMediaId: number | null = null;

      if (messageType === 'audio') {
        try {
          const mediaDownload = await msg.downloadMedia();
          if (mediaDownload && mediaDownload.data) {
            const buffer = Buffer.from(mediaDownload.data, 'base64');
            const sizeKB = buffer.length / 1024;
            logger.info(`Áudio recebido de ${msg.from}: ${sizeKB.toFixed(0)}KB, mimetype=${mediaDownload.mimetype}`);

            // Salvar arquivo de áudio em disco para exibição no dashboard
            incomingMediaId = await this.saveIncomingMedia(buffer, mediaDownload.mimetype || 'audio/ogg');

            // Transcrever áudio
            const { AudioTranscriptionService } = await import('./audioTranscription.service');
            const transcriptionService = new AudioTranscriptionService();
            const result = await transcriptionService.transcribe(buffer, mediaDownload.mimetype || 'audio/ogg');

            if (result && result.text) {
              messageBody = result.text;
              logger.info(`Áudio transcrito (${result.audio_duration}s em ${result.transcription_time}s): "${messageBody.substring(0, 80)}..."`);
            } else {
              messageBody = '[Áudio recebido - transcrição indisponível]';
              logger.warn(`Falha na transcrição de áudio de ${msg.from}`);
            }
          } else {
            messageBody = '[Áudio recebido - download falhou]';
            logger.warn(`Download de áudio falhou para msg de ${msg.from}`);
          }
        } catch (err: any) {
          messageBody = '[Áudio recebido - erro no processamento]';
          logger.error(`Erro ao processar áudio de ${msg.from}: ${err.message}`);
        }
      } else if (messageType === 'media') {
        // Salvar mídias de clientes (imagens, vídeos, documentos) para exibição no dashboard
        try {
          const mediaDownload = await msg.downloadMedia();
          if (mediaDownload && mediaDownload.data) {
            const buffer = Buffer.from(mediaDownload.data, 'base64');
            const filename = (mediaDownload as any).filename || undefined;
            incomingMediaId = await this.saveIncomingMedia(buffer, mediaDownload.mimetype || 'application/octet-stream', filename);
          }
        } catch (err: any) {
          logger.warn(`Não foi possível baixar mídia recebida de ${msg.from}: ${err.message}`);
        }
      }

      const bodyPreview = messageBody ? (messageBody.length > 50 ? messageBody.substring(0, 50) + '...' : messageBody) : '[sem texto]';

      logger.debug(`Processando mensagem recebida de ${contactNumber}. msg.from=${msg.from}, tipo=${messageType}, msg.body="${bodyPreview}"`);
      logger.info(`Mensagem recebida de ${contactName} (${contactNumber}): tipo=${messageType}, "${bodyPreview}"`);

      // Buscar ou criar conversa usando número OU LID
      let conversation = await this.conversationModel.findByUserOrLid(
        this.userId,
        contactNumber,
        lid
      );
      let isNewConversation = false;

      if (!conversation) {
        isNewConversation = true;
        conversation = await this.conversationModel.create({
          user_id: this.userId,
          contact_number: contactNumber,
          contact_name: contactName,
          lid: lid,
          status: 'new',
          last_message_at: new Date(),
        });
      } else {
        // Atualizar última mensagem e LID se estiver faltando
        const updates: any = {
          last_message_at: new Date(),
        };

        // Conversa finalizada que recebe nova mensagem: reclassificar como nova interação (status 'new')
        if (conversation.status === 'finished') {
          updates.status = 'new';
        }

        // Se a conversa não tem LID e recebemos um, atualizar
        if (lid && !conversation.lid) {
          logger.info(`Atualizando conversa ${conversation.id} com LID: ${lid}`);
          updates.lid = lid;
        } else if (lid && conversation.lid && conversation.lid !== lid) {
          logger.info(`Atualizando conversa ${conversation.id} com novo LID: ${conversation.lid} -> ${lid}`);
          updates.lid = lid;
        }

        await this.conversationModel.update(conversation.id, updates);
      }

      // Validar se a mensagem deve ser salva
      // Ignorar mensagens sem conteúdo que não sejam mídia, áudio ou localização
      if (!messageBody && messageType !== 'media' && messageType !== 'audio' && messageType !== 'location' && messageType !== 'contact') {
        logger.debug(`Mensagem sem conteúdo relevante ignorada (tipo: ${messageType})`);
        return;
      }

      // Salvar mensagem no banco
      let savedMessage: any = null;
      try {
        savedMessage = await this.messageModel.create({
          conversation_id: conversation.id,
          message_id: msg.id._serialized,
          content: messageBody || `[${messageType}]`,
          message_type: messageType,
          media_id: incomingMediaId || undefined,
          direction: 'incoming',
          is_from_ai: false,
        });
        logger.info(`Mensagem salva no banco: ID=${savedMessage.id}, conversation_id=${conversation.id}, tipo=${messageType}, media_id=${incomingMediaId}, content="${bodyPreview}"`);
      } catch (error: any) {
        logger.error(`Erro ao salvar mensagem no banco: ${error.message}`);
        // Continuar mesmo se falhar ao salvar, para não perder o processamento
      }

      // Montar info de mídia para o socket (exibição em tempo real no dashboard)
      let socketMedia: any = null;
      if (incomingMediaId) {
        try {
          const { MediaModel } = await import('../models/media.model');
          const mediaModel = new MediaModel();
          const savedMedia = await mediaModel.findById(incomingMediaId);
          if (savedMedia) {
            socketMedia = {
              id: savedMedia.id,
              filename: savedMedia.filename,
              fileType: savedMedia.file_type,
              fileSize: typeof savedMedia.file_size === 'bigint' ? Number(savedMedia.file_size) : savedMedia.file_size,
              title: savedMedia.title,
              description: savedMedia.description,
              caption: savedMedia.caption,
            };
          }
        } catch (err: any) {
          logger.warn(`Não foi possível carregar info da mídia para socket: ${err.message}`);
        }
      }

      // Emitir evento para Socket.IO
      const messageData = {
        conversationId: conversation.id,
        message: {
          id: savedMessage?.id || null, // Usar ID numérico do banco se disponível
          messageId: msg.id._serialized, // message_id do WhatsApp
          content: messageBody || `[${messageType}]`,
          messageType: messageType,
          from: contactNumber,
          fromName: contactName,
          timestamp: msg.timestamp,
          direction: 'incoming' as const,
          isFromAi: false,
          media: socketMedia,
        },
      };

      logger.debug(`Emitindo evento 'message' via Socket.IO para conversa ${conversation.id}:`, {
        conversationId: messageData.conversationId,
        id: messageData.message.id,
        messageId: messageData.message.messageId,
        direction: messageData.message.direction,
      });

      this.emit('message', messageData);

      // Emitir atualização do card da conversa para lista em tempo real
      try {
        const card = await this.conversationModel.getConversationCardById(this.userId, conversation.id);
        if (card) {
          if (isNewConversation) {
            emitConversationNew(this.userId, card);
          } else {
            emitConversationUpdated(this.userId, card);
          }
        }
      } catch (err: any) {
        logger.warn(`Erro ao emitir conversation (incoming): ${err?.message}`);
      }

      logger.info(`Mensagem recebida de ${contactName} (${contactNumber}): "${(messageBody || '').substring(0, 50)}..."`);

      // Debounce: agrupar mensagens curtas do cliente antes de processar com a IA (evita várias respostas fragmentadas)
      const debounceMs = this.getDebounceMs();
      const convId = conversation.id;
      const currentContent = messageBody || `[${messageType}]`;

      const pending = this.pendingMessages.get(convId) || [];
      pending.push(currentContent);
      this.pendingMessages.set(convId, pending);

      const existingTimer = this.responseTimers.get(convId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.responseTimers.delete(convId);
      }

      const processPending = () => {
        this.responseTimers.delete(convId);
        const messages = this.pendingMessages.get(convId) || [];
        this.pendingMessages.delete(convId);
        if (messages.length === 0) return;
        const consolidated = messages.join('\n').trim();
        if (!consolidated) return;
        if (messages.length > 1) {
          logger.info(`Processando ${messages.length} mensagens agrupadas da conversa ${convId}: "${consolidated.substring(0, 80)}..."`);
        }
        this.conversationService.processIncomingMessage(
          this.userId,
          convId,
          consolidated,
          this
        ).catch((error: any) => {
          logger.error(`Erro ao processar mensagem automaticamente: ${error.message}`);
        });
      };

      if (debounceMs <= 0) {
        setImmediate(processPending);
      } else {
        const timer = setTimeout(processPending, debounceMs);
        this.responseTimers.set(convId, timer);
      }
    } catch (error: any) {
      logger.error(`Erro ao processar mensagem recebida: ${error.message}`);
      // NÃO lançar erro -apenas logar para evitar crash
      // throw error;
    }
  }

  private async handleOutgoingMessage(msg: Message): Promise<void> {
    try {
      // Extrair número e nome do contato de forma inteligente (lidando com @lid)
      const { contactNumber, contactName, lid } = await this.getContactInfo(msg);

      if (!contactNumber) {
        logger.warn('Não foi possível extrair número do contato da mensagem enviada');
        return;
      }

      logger.debug(`Processando mensagem enviada para ${contactNumber}`);

      // Buscar conversa
      let conversation = await this.conversationModel.findByUserOrLid(
        this.userId,
        contactNumber,
        lid
      );

      // Se não existe conversa, criar uma
      if (!conversation) {
        try {
          // Usar informações já extraídas pelo getContactInfo para evitar chamadas extras ao Puppeteer
          conversation = await this.conversationModel.create({
            user_id: this.userId,
            contact_number: contactNumber,
            contact_name: contactName,
            lid: lid,
            status: 'new',
            last_message_at: new Date(),
          });
          logger.info(`Conversa criada para ${contactName} (${contactNumber})`);
        } catch (error: any) {
          logger.error(`Erro ao criar conversa para mensagem enviada: ${error.message}`);
          return;
        }
      } else if (lid && !conversation.lid) {
        // Se a conversa existe mas não tem LID, atualizar
        await this.conversationModel.update(conversation.id, { lid: lid });
      }

      // Extrair conteúdo da mensagem antes de verificar duplicatas
      const messageBody = msg.body || '';

      // Verificar se a mensagem já foi salva (evitar duplicatas)
      // Primeiro verificar por message_id
      let existingMessage = await this.messageModel.findByMessageId(msg.id._serialized);

      // Se não encontrou por message_id, verificar por conversation_id + content + direction
      // Isso cobre o caso onde a mensagem foi salva sem message_id
      if (!existingMessage && messageBody) {
        const recentMessages = await this.messageModel.findByConversationId(conversation.id, 10);
        const now = new Date();

        // Procurar mensagem com mesmo conteúdo, direção e criada nos últimos 5 segundos
        existingMessage = recentMessages.find(m =>
          m.direction === 'outgoing' &&
          m.content === messageBody &&
          Math.abs(now.getTime() - new Date(m.created_at).getTime()) < 5000 // 5 segundos
        ) || null;

        if (existingMessage) {
          logger.debug(`Mensagem duplicada encontrada por conteúdo: id=${existingMessage.id}, message_id=${existingMessage.message_id || 'NULL'}`);

          // Se a mensagem existente não tem message_id, atualizar com o message_id correto
          if (!existingMessage.message_id && msg.id._serialized) {
            try {
              await this.messageModel.update(existingMessage.id, {
                message_id: msg.id._serialized
              });
              logger.debug(`Mensagem atualizada com message_id: id=${existingMessage.id}, message_id=${msg.id._serialized}`);
            } catch (error: any) {
              logger.error(`Erro ao atualizar message_id: ${error.message}`);
            }
          }
        }
      }

      if (existingMessage) {
        logger.debug(`Mensagem já existe no banco: id=${existingMessage.id}, message_id=${msg.id._serialized}, ignorando salvamento duplicado`);

        // Se a mensagem existe mas não está marcada como IA e deveria estar, atualizar
        if (!existingMessage.is_from_ai && this.pendingAIMessages.has(msg.id._serialized)) {
          try {
            await this.messageModel.update(existingMessage.id, { is_from_ai: true });
            logger.debug(`Mensagem atualizada para is_from_ai=true: message_id=${msg.id._serialized}`);
            this.pendingAIMessages.delete(msg.id._serialized);
          } catch (error: any) {
            logger.error(`Erro ao atualizar mensagem: ${error.message}`);
          }
        }

        // CORREÇÃO ESPECÍFICA PARA IA: Se a mensagem é da IA, é mídia e não tem media_id, tentar buscar e atualizar
        // Isso resolve race condition onde message_create é disparado antes do sendMedia retornar
        if (msg.hasMedia && !existingMessage.media_id) {
          // Verificar se é mensagem da IA (por message_id ou por caption)
          let isFromAI = this.pendingAIMessages.has(msg.id._serialized);

          if (!isFromAI && msg.body) {
            const contentHash = `${msg.body.substring(0, 100)}_${msg.body.length}`;
            isFromAI = this.pendingAIMessages.has(contentHash);
          }

          if (!isFromAI && msg.hasMedia) {
            const msgData = (msg as any)._data || {};
            const caption = msgData.caption || msg.body || '';
            if (caption) {
              const captionHash = `${caption.substring(0, 100)}_${caption.length}`;
              isFromAI = this.pendingAIMessages.has(captionHash);
            }
          }

          // Só atualizar se for mensagem da IA
          if (isFromAI) {
            let mediaId: number | null = null;

            // Tentar buscar por message_id
            mediaId = this.pendingMediaIds.get(msg.id._serialized) || null;

            // Se não encontrou por message_id e tem body, tentar por hash do caption
            if (!mediaId && msg.body) {
              const contentHash = `${msg.body.substring(0, 100)}_${msg.body.length}`;
              mediaId = this.pendingMediaIds.get(contentHash) || null;
              if (mediaId) {
                this.pendingMediaIds.delete(contentHash);
                this.pendingMediaIds.set(msg.id._serialized, mediaId);
              }
            }

            // Se ainda não encontrou, tentar pelo caption
            if (!mediaId && msg.hasMedia) {
              const msgData = (msg as any)._data || {};
              const caption = msgData.caption || msg.body || '';
              if (caption) {
                const captionHash = `${caption.substring(0, 100)}_${caption.length}`;
                mediaId = this.pendingMediaIds.get(captionHash) || null;
                if (mediaId) {
                  this.pendingMediaIds.delete(captionHash);
                  this.pendingMediaIds.set(msg.id._serialized, mediaId);
                }
              }
            }

            // Se encontrou media_id, atualizar a mensagem no banco
            if (mediaId) {
              try {
                await this.messageModel.update(existingMessage.id, { media_id: mediaId });
                logger.debug(`Media_id da IA atualizado: message_id=${msg.id._serialized}, media_id=${mediaId}`);
                this.pendingMediaIds.delete(msg.id._serialized);
              } catch (error: any) {
                logger.error(`Erro ao atualizar media_id da mensagem da IA: ${error.message}`);
              }
            }
          }
        }

        return;
      }

      // Verificar se a mensagem foi enviada pela IA
      // Primeiro verificar por message_id, depois por conteúdo (para casos de race condition)
      let isFromAI = this.pendingAIMessages.has(msg.id._serialized);

      // Se não encontrou por message_id, tentar por conteúdo (hash temporário)
      if (!isFromAI && msg.body) {
        const contentHash = `${msg.body.substring(0, 100)}_${msg.body.length}`;
        isFromAI = this.pendingAIMessages.has(contentHash);
        if (isFromAI) {
          // Limpar hash temporário e adicionar com message_id real
          this.pendingAIMessages.delete(contentHash);
          this.pendingAIMessages.set(msg.id._serialized, true);
        }
      }

      // Se ainda não encontrou e é mensagem de mídia, verificar pelo caption
      if (!isFromAI && msg.hasMedia) {
        const msgData = (msg as any)._data || {};
        const caption = msgData.caption || msg.body || '';
        if (caption) {
          const captionHash = `${caption.substring(0, 100)}_${caption.length}`;
          isFromAI = this.pendingAIMessages.has(captionHash);
          if (isFromAI) {
            // Limpar hash temporário e adicionar com message_id real
            this.pendingAIMessages.delete(captionHash);
            this.pendingAIMessages.set(msg.id._serialized, true);
          }
        }
      }

      logger.debug(`Verificando se mensagem é da IA: message_id=${msg.id._serialized}, isFromAI=${isFromAI}`);

      // Detectar tipo de mensagem para mensagens enviadas
      const messageType = this.detectMessageType(msg);

      // Buscar media_id se for mensagem de mídia
      let mediaId: number | null = null;
      if (messageType === 'media') {
        // Tentar buscar por message_id
        mediaId = this.pendingMediaIds.get(msg.id._serialized) || null;

        // Se não encontrou por message_id e tem body, tentar por hash do caption
        if (!mediaId && msg.body) {
          const contentHash = `${msg.body.substring(0, 100)}_${msg.body.length}`;
          mediaId = this.pendingMediaIds.get(contentHash) || null;
          if (mediaId) {
            // Mover para message_id real
            this.pendingMediaIds.delete(contentHash);
            this.pendingMediaIds.set(msg.id._serialized, mediaId);
          }
        }

        // Se ainda não encontrou e é mídia, tentar pelo caption
        if (!mediaId && msg.hasMedia) {
          const msgData = (msg as any)._data || {};
          const caption = msgData.caption || msg.body || '';
          if (caption) {
            const captionHash = `${caption.substring(0, 100)}_${caption.length}`;
            mediaId = this.pendingMediaIds.get(captionHash) || null;
            if (mediaId) {
              // Mover para message_id real
              this.pendingMediaIds.delete(captionHash);
              this.pendingMediaIds.set(msg.id._serialized, mediaId);
              logger.debug(`Mídia encontrada por captionHash: ${captionHash.substring(0, 50)}... -> message_id=${msg.id._serialized}, media_id=${mediaId}`);
            }
          }

          // CORREÇÃO: Se ainda não encontrou, tentar buscar por chaves temporárias que contenham o contactNumber
          // Isso resolve race condition onde message_create é disparado antes do sendMessage retornar
          if (!mediaId) {
            // Buscar todas as chaves que começam com o contactNumber
            for (const [key, value] of this.pendingMediaIds.entries()) {
              if (key.startsWith(contactNumber + '_')) {
                mediaId = value;
                // Mover para message_id real
                this.pendingMediaIds.delete(key);
                this.pendingMediaIds.set(msg.id._serialized, mediaId);
                logger.debug(`Mídia encontrada por chave temporária: ${key.substring(0, 50)}... -> message_id=${msg.id._serialized}, media_id=${mediaId}`);
                break;
              }
            }
          }
        }
      }

      // Salvar mensagem no banco
      let savedMessage: any = null;
      try {
        savedMessage = await this.messageModel.create({
          conversation_id: conversation.id,
          message_id: msg.id._serialized,
          content: messageBody || `[${messageType}]`,
          message_type: messageType,
          media_id: mediaId,
          direction: 'outgoing',
          is_from_ai: isFromAI,
        });

        // Remover do Map após salvar
        if (isFromAI) {
          this.pendingAIMessages.delete(msg.id._serialized);
        }
        if (mediaId) {
          this.pendingMediaIds.delete(msg.id._serialized);
        }

        logger.info(`Mensagem enviada salva no banco: ID=${savedMessage.id}, conversation_id=${conversation.id}, is_from_ai=${isFromAI}`);
      } catch (error: any) {
        logger.error(`Erro ao salvar mensagem enviada no banco: ${error.message}`);
      }

      // Atualizar última mensagem
      await this.conversationModel.update(conversation.id, {
        last_message_at: new Date(),
      });

      // Buscar dados de mídia se for mensagem de mídia
      let mediaData = null;
      if (messageType === 'media' && mediaId) {
        try {
          const { MediaModel } = await import('../models/media.model');
          const mediaModel = new MediaModel();
          const media = await mediaModel.findById(mediaId);
          if (media && media.user_id === this.userId) {
            const fileSize = typeof media.file_size === 'bigint'
              ? Number(media.file_size)
              : media.file_size;
            mediaData = {
              id: media.id,
              filename: media.filename,
              fileType: media.file_type,
              fileSize: fileSize,
              title: media.title,
              description: media.description,
              caption: media.caption || null,
            };
          }
        } catch (error: any) {
          logger.error(`Erro ao buscar dados de mídia para Socket.IO: ${error.message}`);
        }
      }

      // Emitir evento para Socket.IO
      const messageData = {
        conversationId: conversation.id,
        message: {
          id: savedMessage?.id || null, // Usar ID numérico do banco se disponível
          messageId: msg.id._serialized, // message_id do WhatsApp
          content: messageBody || `[${messageType}]`,
          messageType: messageType,
          to: contactNumber,
          timestamp: msg.timestamp,
          direction: 'outgoing' as const,
          isFromAi: isFromAI,
          media: mediaData,
        },
      };

      logger.debug(`Emitindo evento 'message' via Socket.IO para conversa ${conversation.id}:`, {
        conversationId: messageData.conversationId,
        messageId: messageData.message.messageId,
        direction: messageData.message.direction,
        isFromAi: messageData.message.isFromAi,
        hasMedia: !!mediaData,
      });

      this.emit('message', messageData);

      // Emitir atualização do card da conversa para lista em tempo real
      try {
        const card = await this.conversationModel.getConversationCardById(this.userId, conversation.id);
        if (card) emitConversationUpdated(this.userId, card);
      } catch (err: any) {
        logger.warn(`Erro ao emitir conversation:updated (outgoing): ${err?.message}`);
      }

      logger.info(`Mensagem enviada para ${contactNumber}: "${msg.body.substring(0, 50)}..."`);
    } catch (error: any) {
      logger.error(`Erro ao processar mensagem enviada: ${error.message}`);
    }
  }

  async sendMessage(contactNumber: string, content: string, isFromAI: boolean = false): Promise<Message> {
    if (!this.client) {
      logger.error('Tentativa de enviar mensagem falhou: cliente não existe.');
      throw new Error('WhatsApp cliente não está inicializado');
    }

    // Auto-heal: Se isReady for falso mas o cliente existir, verificar se está conectado de fato
    if (!this.isReady()) {
      logger.warn(`⚠️ sendMessage chamado com cliente marcado como não pronto (isInitialized=${this.isInitialized}, isClientReady=${this.isClientReady}). Verificando estado real...`);
      try {
        const state = await this.client.getState();
        logger.info(`Estado real do cliente: ${state}`);
        if (state === 'CONNECTED') {
          logger.info('✅ Cliente está CONECTADO apesar da flag. Forçando isClientReady = true (Self-Healing).');
          this.isClientReady = true;
          this.isInitialized = true;
          // Emitir ready tardio se necessário
          // this.emit('ready'); 
        } else {
          logger.error(`Cliente não está conectado (Estado: ${state}). Não é possível enviar.`);
          throw new Error(`WhatsApp não está pronto (Estado: ${state})`);
        }
      } catch (error: any) {
        logger.error(`Erro ao verificar estado do cliente: ${error.message}`);
        // Se falhar ao verificar estado, assumir que não está pronto, mas tentar enviar se for erro de timeout? 
        // Não, melhor falhar.
        throw new Error('WhatsApp cliente não está pronto e verificação de estado falhou');
      }
    }

    try {
      // Se a mensagem foi enviada pela IA, criar um hash temporário do conteúdo para rastrear
      // Isso permite identificar a mensagem mesmo se o message_create for disparado antes do sendMessage retornar
      let contentHash: string | null = null;
      if (isFromAI && content) {
        // Criar hash simples do conteúdo para rastrear (primeiros 100 caracteres + tamanho)
        contentHash = `${content.substring(0, 100)}_${content.length}`;
        this.pendingAIMessages.set(contentHash, true);
        logger.debug(`Mensagem da IA rastreada por conteúdo: ${contentHash.substring(0, 50)}...`);
      }

      // Sanitize phone number
      let chatId = contactNumber.replace(/\D/g, ''); // Remove non-digits

      // Check if it's a Brazilian number without country code (10 or 11 digits)
      if (chatId.length === 10 || chatId.length === 11) {
        chatId = '55' + chatId;
      }

      if (!chatId.includes('@')) {
        chatId = `${chatId}@c.us`;
      }

      // Verify number logic: Check if number exists on WhatsApp and get correct ID
      try {
        const numberId = await this.client.getNumberId(chatId);
        if (numberId) {
          chatId = numberId._serialized;
          logger.debug(`Número verificado no WhatsApp: ${chatId}`);
        } else {
          logger.warn(`Número não encontrado no WhatsApp (getNumberId retornou null): ${chatId}. Tentando enviar mesmo assim...`);
        }
      } catch (err: any) {
        logger.warn(`Erro ao verificar número (getNumberId): ${err.message}. Usando formato padrão: ${chatId}`);
      }

      logger.debug(`Enviando mensagem para: ${chatId} (original: ${contactNumber})`);

      const message = await this.client.sendMessage(chatId, content, { sendSeen: false });

      // Se a mensagem foi enviada pela IA, atualizar o Map com o message_id real
      if (isFromAI && message.id) {
        // Remover hash temporário se existir
        if (contentHash) {
          this.pendingAIMessages.delete(contentHash);
        }

        // Adicionar com message_id real
        this.pendingAIMessages.set(message.id._serialized, true);
        logger.debug(`Mensagem da IA rastreada: message_id=${message.id._serialized}`);

        // Limpar após 60 segundos para evitar memory leak (aumentado para dar mais tempo)
        setTimeout(() => {
          this.pendingAIMessages.delete(message.id._serialized);
        }, 60000);
      } else if (contentHash) {
        // Se não conseguiu obter message_id, manter o hash temporário por mais tempo
        setTimeout(() => {
          this.pendingAIMessages.delete(contentHash!);
        }, 60000);
      }

      logger.info(`Mensagem enviada para ${contactNumber}${isFromAI ? ' (IA)' : ''}`);
      return message;
    } catch (error: any) {
      // Limpar hash temporário em caso de erro
      if (isFromAI && content) {
        const contentHash = `${content.substring(0, 100)}_${content.length}`;
        this.pendingAIMessages.delete(contentHash);
      }
      logger.error(`Erro ao enviar mensagem: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enviar mídia via WhatsApp com suporte a retry em caso de falha de avaliação do Puppeteer
   */
  async sendMedia(contactNumber: string, filePath: string, caption?: string, isFromAI: boolean = false, mediaId?: number, retryCount: number = 0): Promise<Message> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2 segundos

    if (!this.client || !this.isReady()) {
      logger.error(`Tentativa de enviar mídia falhou: cliente não está pronto. isInitialized=${this.isInitialized}, isClientReady=${this.isClientReady}, client=${this.client ? 'existe' : 'null'}`);
      throw new Error('WhatsApp cliente não está pronto');
    }

    // Declarar variáveis fora do try para poder usar no catch
    let captionHash: string | null = null;
    let tempMediaKey: string | null = null;

    try {
      // Verificar se o arquivo existe
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo de mídia não encontrado: ${filePath}`);
      }

      const chatId = `${contactNumber}@c.us`;

      // Se a mídia foi enviada pela IA, criar um hash temporário do caption para rastrear
      // Isso permite identificar a mensagem mesmo se o message_create for disparado antes do sendMedia retornar
      if (isFromAI && caption) {
        // Criar hash simples do caption para rastrear (primeiros 100 caracteres + tamanho)
        captionHash = `${caption.substring(0, 100)}_${caption.length}`;
        this.pendingAIMessages.set(captionHash, true);
        logger.debug(`Mídia da IA rastreada por caption: ${captionHash.substring(0, 50)}...`);
      }

      // CORREÇÃO: Adicionar media_id ao pendingMediaIds ANTES de enviar (para mídias manuais)
      // Isso evita race condition onde message_create é disparado antes do sendMessage retornar
      if (!isFromAI && mediaId !== undefined) {
        // Criar uma chave temporária baseada no caption (se houver) ou no contactNumber + mediaId
        if (caption && caption.trim()) {
          tempMediaKey = `${caption.substring(0, 100)}_${caption.length}`;
        } else {
          // Se não houver caption, usar contactNumber + mediaId + timestamp como chave temporária
          tempMediaKey = `${contactNumber}_${mediaId}_${Date.now()}`;
        }
        this.pendingMediaIds.set(tempMediaKey, mediaId);
        logger.debug(`Mídia manual rastreada temporariamente: key=${tempMediaKey.substring(0, 50)}..., media_id=${mediaId}`);
      }

      // Criar MessageMedia a partir do arquivo
      const media = MessageMedia.fromFilePath(filePath);

      // Enviar mídia com caption opcional
      const message = await this.client.sendMessage(chatId, media, { caption: caption || '', sendSeen: false });

      // Se a mídia foi enviada pela IA, atualizar o Map com o message_id real
      if (isFromAI && message.id) {
        // Remover hash temporário se existir
        if (captionHash) {
          this.pendingAIMessages.delete(captionHash);
        }

        // Adicionar com message_id real
        this.pendingAIMessages.set(message.id._serialized, true);

        // Armazenar media_id se fornecido
        if (mediaId !== undefined) {
          this.pendingMediaIds.set(message.id._serialized, mediaId);
          // Também armazenar no hash temporário se existir
          if (captionHash) {
            this.pendingMediaIds.set(captionHash, mediaId);
          }
        }

        logger.debug(`Mídia da IA rastreada: message_id=${message.id._serialized}${mediaId !== undefined ? `, media_id=${mediaId}` : ''}`);

        // Limpar após 60 segundos
        setTimeout(() => {
          this.pendingAIMessages.delete(message.id._serialized);
          this.pendingMediaIds.delete(message.id._serialized);
        }, 60000);
      } else if (captionHash) {
        // Se não conseguiu obter message_id, manter o hash temporário por mais tempo
        if (mediaId !== undefined) {
          this.pendingMediaIds.set(captionHash, mediaId);
        }
        setTimeout(() => {
          this.pendingAIMessages.delete(captionHash!);
          this.pendingMediaIds.delete(captionHash!);
        }, 60000);
      }

      // CORREÇÃO: Atualizar chave temporária para message_id real após enviar (para mídias manuais)
      if (!isFromAI && message.id && mediaId !== undefined && tempMediaKey) {
        // Remover chave temporária
        this.pendingMediaIds.delete(tempMediaKey);
        // Adicionar com message_id real
        this.pendingMediaIds.set(message.id._serialized, mediaId);
        logger.debug(`Mídia manual rastreada: message_id=${message.id._serialized}, media_id=${mediaId} (atualizado de ${tempMediaKey.substring(0, 50)}...)`);

        // Limpar após 60 segundos
        setTimeout(() => {
          this.pendingMediaIds.delete(message.id._serialized);
        }, 60000);
      } else if (!isFromAI && message.id && mediaId !== undefined) {
        // Fallback: se não havia chave temporária, adicionar diretamente
        this.pendingMediaIds.set(message.id._serialized, mediaId);
        logger.debug(`Mídia manual rastreada: message_id=${message.id._serialized}, media_id=${mediaId}`);

        // Limpar após 60 segundos
        setTimeout(() => {
          this.pendingMediaIds.delete(message.id._serialized);
        }, 60000);
      }

      logger.info(`Mídia enviada para ${contactNumber}${isFromAI ? ' (IA)' : ''}: ${filePath}`);
      return message;
    } catch (error: any) {
      // Se for erro de "Evaluation failed" e ainda temos retries
      if (error.message?.includes('Evaluation failed') && retryCount < MAX_RETRIES) {
        logger.warn(`Tentativa ${retryCount + 1}/${MAX_RETRIES} falhou ao enviar mídia para ${contactNumber} (erro: ${error.message}). Aguardando ${RETRY_DELAY}ms antes de tentar novamente...`);

        // Limpar hashes temporários antes de tentar novamente para evitar duplicidade ou memory leak
        if (isFromAI && captionHash) {
          this.pendingAIMessages.delete(captionHash);
          if (mediaId !== undefined) {
            this.pendingMediaIds.delete(captionHash);
          }
        }
        if (!isFromAI && tempMediaKey) {
          this.pendingMediaIds.delete(tempMediaKey);
        }

        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

        // Tentar novamente
        return this.sendMedia(contactNumber, filePath, caption, isFromAI, mediaId, retryCount + 1);
      }

      // Limpar hash temporário em caso de erro definitivo
      if (isFromAI && captionHash) {
        this.pendingAIMessages.delete(captionHash);
        if (mediaId !== undefined) {
          this.pendingMediaIds.delete(captionHash);
        }
      }
      // Limpar chave temporária de mídia manual em caso de erro definitivo
      if (!isFromAI && tempMediaKey) {
        this.pendingMediaIds.delete(tempMediaKey);
        logger.debug(`Chave temporária removida devido a erro definitivo: ${tempMediaKey.substring(0, 50)}...`);
      }
      logger.error(`Erro definitivo ao enviar mídia após ${retryCount} retries: ${error.message}`);
      throw error;
    }
  }

  async getChat(contactNumber: string): Promise<Chat | null> {
    if (!this.client || !this.isReady()) {
      return null;
    }

    try {
      const chatId = `${contactNumber}@c.us`;
      const chat = await this.client.getChatById(chatId);
      return chat;
    } catch (error: any) {
      logger.error(`Erro ao buscar chat: ${error.message}`);
      return null;
    }
  }

  async getStatus(): Promise<'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'connection_failed'> {
    // Se o cliente está pronto, retornar 'connected' independente do banco
    // (como no exemplo modelo que verifica isReady primeiro)
    if (this.isReady()) {
      logger.debug(`getStatus para usuário ${this.userId}: cliente está pronto, retornando 'connected'`);
      return 'connected';
    }

    // Caso contrário, verificar no banco
    try {
      const session = await this.sessionModel.findByUserId(this.userId);
      if (!session) {
        logger.debug(`getStatus para usuário ${this.userId}: sessão não encontrada no banco, retornando 'disconnected'`);
        return 'disconnected';
      }
      logger.debug(`getStatus para usuário ${this.userId}: sessão encontrada no banco com status '${session.status}'`);
      return session.status;
    } catch (error: any) {
      logger.error(`Erro ao buscar status no banco para usuário ${this.userId}: ${error.message}`);
      return 'disconnected';
    }
  }

  async getQRCode(): Promise<string | null> {
    // Primeiro verificar em memória (mais rápido)
    if (this.lastQRCode) {
      logger.debug(`getQRCode para usuário ${this.userId}: retornando da memória`);
      return this.lastQRCode;
    }

    try {
      const session = await this.sessionModel.findByUserId(this.userId);
      if (!session) {
        logger.debug(`getQRCode para usuário ${this.userId}: sessão não encontrada no banco`);
        return null;
      }

      let qrCode = session.qr_code || null;

      // Tratar caso onde o banco retorna string "null" em vez de null
      if (qrCode === 'null' || qrCode === '' || (typeof qrCode === 'string' && qrCode.trim() === '')) {
        qrCode = null;
      }

      // IMPORTANTE: Verificar se o QR code está expirado (mais de 2 minutos desde updated_at)
      if (qrCode && session.updated_at) {
        const qrCodeAge = Date.now() - new Date(session.updated_at).getTime();
        const qrCodeExpirationTime = 2 * 60 * 1000; // 2 minutos

        if (qrCodeAge > qrCodeExpirationTime) {
          logger.warn(`⚠️ QR code expirado encontrado no banco para usuário ${this.userId} (idade: ${Math.round(qrCodeAge / 1000 / 60)} minutos). Limpando...`);

          // Limpar QR code expirado do banco
          try {
            await this.sessionModel.updateByUserId(this.userId, {
              qr_code: undefined,
              // ✅ Manter status atual -não alterar para 'disconnected' (só no logout manual)
              status: session.status,
            });
            logger.info(`✅ QR code expirado limpo do banco para usuário ${this.userId}`);
          } catch (error: any) {
            logger.error(`Erro ao limpar QR code expirado do banco: ${error.message}`);
          }

          // Limpar da memória também
          this.lastQRCode = null;
          qrCode = null;
        } else {
          // QR code ainda válido, atualizar memória
          this.lastQRCode = qrCode;
          logger.debug(`QR code válido encontrado no banco para usuário ${this.userId} (idade: ${Math.round(qrCodeAge / 1000)} segundos)`);
        }
      } else if (qrCode) {
        // Se não tem updated_at mas tem QR code, assumir que é válido (mas logar aviso)
        logger.warn(`QR code encontrado sem updated_at para usuário ${this.userId}. Assumindo válido.`);
        this.lastQRCode = qrCode;
      }

      logger.debug(`getQRCode para usuário ${this.userId}: ${qrCode ? 'presente' : 'null'}`);
      return qrCode;
    } catch (error: any) {
      logger.error(`Erro ao buscar QR code para usuário ${this.userId}: ${error.message}`);
      return null;
    }
  }

  isReady(): boolean {
    // Verificar se o cliente está inicializado E realmente pronto (evento 'ready' foi disparado)
    return this.client !== null && this.isInitialized && this.isClientReady;
  }

  /**
   * Iniciar keep-alive para manter sessão ativa
   * Executa ações periódicas para evitar que a sessão expire
   * Intervalo aumentado para evitar sobrecarga que pode causar desconexão
   */
  private startKeepAlive(): void {
    // Parar keep-alive anterior se existir
    this.stopKeepAlive();

    // Executar keep-alive a cada 15 minutos
    // Intervalo equilibrado para monitorar conexão sem sobrecarregar
    // Se falhar 4 vezes consecutivas (1 hora), marca como connection_failed
    const keepAliveIntervalMs = 15 * 60 * 1000; // 15 minutos

    this.keepAliveInterval = setInterval(async () => {
      await this.performKeepAlive();
    }, keepAliveIntervalMs);

    logger.info(`Keep-alive iniciado para usuário ${this.userId} (intervalo: ${keepAliveIntervalMs}ms)`);
  }

  /**
   * Parar keep-alive
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      logger.debug(`Keep-alive parado para usuário ${this.userId}`);
    }
  }

  /**
   * Executar ação de keep-alive para manter sessão ativa
   * Realiza verificação do estado e atualiza o banco de dados
   * IMPORTANTE: Tenta reativar UMA vez por ciclo. Continua indefinidamente.
   * Após 4 falhas consecutivas (1h), marca como 'connection_failed' mas continua tentando.
   */
  private async performKeepAlive(): Promise<void> {
    if (!this.client || !this.isClientReady) {
      logger.debug(`Keep-alive ignorado para usuário ${this.userId} -cliente não está pronto`);
      return;
    }

    try {
      // Verificar estado da conexão
      const state = await this.client.getState();

      if (state === 'CONNECTED') {
        // ✅ Conexão OK -resetar contador de erros e atualizar banco
        if (this.keepAliveErrorCount > 0) {
          logger.info(`✅ Conexão restaurada para usuário ${this.userId} após ${this.keepAliveErrorCount} tentativa(s)`);
        }
        this.keepAliveErrorCount = 0;

        // Atualizar last_connected_at e garantir status 'connected' no banco
        try {
          await this.sessionModel.updateByUserId(this.userId, {
            status: 'connected',
            last_connected_at: new Date(),
          });
          logger.debug(`Keep-alive OK para usuário ${this.userId} -status e timestamp atualizados`);
        } catch (dbError: any) {
          logger.debug(`Keep-alive OK, mas erro ao atualizar banco: ${dbError.message}`);
        }
      } else {
        // ⚠️ Estado problemático -tentar "acordar" a conexão UMA vez
        this.keepAliveErrorCount++;
        logger.warn(`WhatsApp em estado "${state}" para usuário ${this.userId} (tentativa ${this.keepAliveErrorCount}/${this.MAX_KEEPALIVE_ERRORS})`);

        // Tentar reativar UMA vez por ciclo
        try {
          await this.client.getChats();

          // Verificar se funcionou
          const newState = await this.client.getState();
          if (newState === 'CONNECTED') {
            logger.info(`✅ Conexão reativada com sucesso para usuário ${this.userId}`);
            this.keepAliveErrorCount = 0;
            await this.sessionModel.updateByUserId(this.userId, {
              status: 'connected',
              last_connected_at: new Date(),
            });
          } else {
            logger.warn(`Reativação não funcionou, estado ainda "${newState}". Próxima tentativa em 15 min.`);
            // Atualizar updated_at para registrar tentativa
            await this.sessionModel.updateByUserId(this.userId, {});
          }
        } catch (reactivateError: any) {
          logger.warn(`Falha ao tentar reativar: ${reactivateError.message}. Próxima tentativa em 15 min.`);
          // Atualizar updated_at para registrar tentativa
          try {
            await this.sessionModel.updateByUserId(this.userId, {});
          } catch { /* ignorar */ }
        }

        // Se atingiu o limite de erros, marcar como 'connection_failed' (NÃO 'disconnected')
        // MAS continuar tentando indefinidamente
        if (this.keepAliveErrorCount >= this.MAX_KEEPALIVE_ERRORS) {
          logger.error(`⚠️ ${this.MAX_KEEPALIVE_ERRORS} falhas consecutivas para usuário ${this.userId}. Marcando como 'connection_failed'.`);

          try {
            await this.sessionModel.updateByUserId(this.userId, {
              status: 'connection_failed',
            });

            // Emitir evento para notificar frontend
            this.emit('connection_failed', 'KEEP_ALIVE_FAILURE');

            // IMPORTANTE: NÃO parar keep-alive -continuar tentando indefinidamente
            // Resetar contador para evitar spam de logs
            this.keepAliveErrorCount = 0;
            logger.info(`Keep-alive continuará tentando reconectar usuário ${this.userId} a cada 15 min`);
          } catch (dbError: any) {
            logger.error(`Erro ao atualizar status para 'connection_failed': ${dbError.message}`);
          }
        }
      }
    } catch (error: any) {
      // Erro ao verificar estado -incrementar contador
      this.keepAliveErrorCount++;
      logger.error(`Erro no keep-alive para usuário ${this.userId} (${this.keepAliveErrorCount}/${this.MAX_KEEPALIVE_ERRORS}): ${error.message}`);

      // Atualizar updated_at para registrar tentativa
      try {
        await this.sessionModel.updateByUserId(this.userId, {});
      } catch { /* ignorar */ }

      // Se atingiu limite, marcar como 'connection_failed' mas continuar tentando
      if (this.keepAliveErrorCount >= this.MAX_KEEPALIVE_ERRORS) {
        logger.error(`⚠️ ${this.MAX_KEEPALIVE_ERRORS} erros consecutivos para usuário ${this.userId}. Marcando como 'connection_failed'.`);

        try {
          await this.sessionModel.updateByUserId(this.userId, {
            status: 'connection_failed',
          });
          this.emit('connection_failed', 'KEEP_ALIVE_FAILURE');
          this.keepAliveErrorCount = 0; // Resetar para evitar spam
          logger.info(`Keep-alive continuará tentando reconectar usuário ${this.userId} a cada 15 min`);
        } catch (dbError: any) {
          logger.error(`Erro ao atualizar status: ${dbError.message}`);
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    logger.info(`Desconectando WhatsApp para usuário ${this.userId}...`);

    // Parar keep-alive
    this.stopKeepAlive();

    if (this.client) {
      try {
        // Fechar browser explicitamente antes de destruir
        await this.closeBrowserSafely();
        await this.client.destroy();
      } catch (error: any) {
        // Logar erro mas continuar com a limpeza
        logger.error(`Erro ao destruir cliente WhatsApp para usuário ${this.userId}: ${error.message}`);
      } finally {
        // Sempre limpar referências, mesmo se destroy falhou
        this.client = null;
        this.isInitialized = false;
        this.isClientReady = false;
        this.readyProcessing = false;
        this.authenticatedProcessing = false;
      }
    }

    // ✅ CRÍTICO: Limpar processos Chrome e lock files para evitar "browser already running" na reconexão
    // Isso NÃO deleta arquivos de sessão (.wwebjs_auth, Default profile) -apenas locks temporários
    logger.info(`Aguardando 2s e limpando processos Chrome para usuário ${this.userId}...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
    const userSessionPath = path.join(sessionPath, `user_${this.userId}`);
    await this.killBrowserProcessesForSession(userSessionPath);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Remover apenas arquivos de lock (lockfile, DevToolsActivePort, SingletonLock)
    // Os arquivos de sessão (.wwebjs_auth, Default) são preservados para reconexão automática
    try {
      const localAuthPath = this.getLocalAuthSessionPath();
      if (fs.existsSync(localAuthPath)) {
        this.removeLockFilesFromSession(localAuthPath);
        logger.info(`✅ Lock files removidos para usuário ${this.userId} (arquivos de sessão preservados)`);
      }
    } catch (error: any) {
      logger.debug(`Erro ao remover locks no disconnect: ${error.message}`);
    }

    // Atualizar status no banco
    try {
      await this.sessionModel.updateByUserId(this.userId, {
        status: 'disconnected',
      });
    } catch (error: any) {
      logger.error(`Erro ao atualizar status no banco para usuário ${this.userId}: ${error.message}`);
    }

    logger.info(`✅ WhatsApp desconectado e processos limpos para usuário ${this.userId} (sessão preservada para reconexão)`);
  }

  async logout(): Promise<void> {
    logger.info(`🔄 Iniciando logout para usuário ${this.userId}...`);

    // Parar keep-alive
    this.stopKeepAlive();

    const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
    const userSessionPath = path.join(sessionPath, `user_${this.userId}`);

    // Se há cliente ativo, fazer logout, fechar browser e desconectar
    if (this.client) {
      try {
        // Tentar fazer logout (faz logout no WA e chama pupBrowser.close())
        await this.client.logout();
        logger.info(`✅ client.logout() executado para usuário ${this.userId}`);
      } catch (error: any) {
        // No Windows, é comum que arquivos de sessão estejam em uso (EBUSY)
        // especialmente lockfile e chrome_debug.log. Isso não deve impedir o logout.
        if (error.code === 'EBUSY' || error.message?.includes('EBUSY') || error.message?.includes('resource busy') || error.message?.includes('lockfile')) {
          logger.warn(`Arquivos de sessão em uso durante logout para usuário ${this.userId} (EBUSY). Continuando com desconexão...`);
          // Não propagar o erro -apenas logar e continuar
        } else {
          // Para outros erros, logar mas continuar
          logger.error(`Erro durante logout para usuário ${this.userId}: ${error.message}`);
        }
      }

      // Fechar o browser explicitamente (caso client.logout() não tenha fechado ou tenha falhado)
      await this.closeBrowserSafely();

      // Sempre tentar desconectar, mesmo se logout falhou
      try {
        await this.disconnect();
        logger.info(`✅ disconnect() executado para usuário ${this.userId}`);
      } catch (error: any) {
        logger.error(`Erro ao desconectar após logout para usuário ${this.userId}: ${error.message}`);
      }

      // Aguardar e matar qualquer processo Chrome que ainda esteja usando o diretório da sessão
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.killBrowserProcessesForSession(userSessionPath);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      logger.warn(`⚠️ Logout solicitado para usuário ${this.userId} mas não há cliente ativo. Continuando com limpeza de arquivos e banco...`);
      // Sem cliente em memória, ainda assim tentar matar processos órfãos que usem a sessão
      await this.killBrowserProcessesForSession(userSessionPath);
    }

    // Remover arquivos de lock (lockfile, DevToolsActivePort, SingletonLock) no diretório session-user_X
    try {
      const localAuthPath = this.getLocalAuthSessionPath();
      if (fs.existsSync(localAuthPath)) {
        this.removeLockFilesFromSession(localAuthPath);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      logger.debug(`Erro ao remover locks no logout: ${error.message}`);
    }

    // ✅ CORREÇÃO: SEMPRE deletar arquivos de sessão, independente de ter cliente ou não
    try {

      if (fs.existsSync(userSessionPath)) {
        logger.info(`🗑️ Deletando arquivos de sessão para usuário ${this.userId} após logout manual...`);
        // Aguardar um pouco antes de deletar para garantir que processos foram fechados
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Tentar deletar com retry em caso de EBUSY
        let retries = 3;
        while (retries > 0) {
          try {
            fs.rmSync(userSessionPath, { recursive: true, force: true });
            logger.info(`✅ Arquivos de sessão deletados para usuário ${this.userId} de ${userSessionPath}`);
            break;
          } catch (error: any) {
            retries--;
            if (error.code === 'EBUSY' && retries > 0) {
              logger.warn(`Arquivos em uso (EBUSY), aguardando... (${retries} tentativas restantes)`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              logger.warn(`Erro ao deletar arquivos de sessão: ${error.message}`);
              break;
            }
          }
        }
      } else {
        logger.debug(`Diretório de sessão não existe para usuário ${this.userId}: ${userSessionPath}`);
      }
    } catch (error: any) {
      logger.error(`Erro ao deletar arquivos de sessão após logout: ${error.message}`);
    }

    // ✅ CORREÇÃO: SEMPRE remover sessão do banco, independente de ter cliente ou não
    try {
      const session = await this.sessionModel.findByUserId(this.userId);
      if (session) {
        await this.sessionModel.delete(session.id);
        logger.info(`✅ Sessão removida do banco para usuário ${this.userId}`);
      } else {
        logger.debug(`Nenhuma sessão encontrada no banco para usuário ${this.userId}`);
      }
    } catch (error: any) {
      logger.error(`Erro ao remover sessão do banco para usuário ${this.userId}: ${error.message}`);
    }

    logger.info(`✅ WhatsApp logout completo para usuário ${this.userId}`);
  }
}

