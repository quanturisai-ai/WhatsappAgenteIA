// IMPORTANTE: Configurar cache do Puppeteer ANTES de qualquer importação
// Isso garante que o cache path esteja correto antes do Puppeteer ser importado
import path from 'path';
import fs from 'fs';
import os from 'os';

if (!process.env.PUPPETEER_CACHE_DIR) {
  // ✅ CORREÇÃO: Usar LOCALAPPDATA no Windows para evitar cache do sistema
  let userCacheDir: string;
  
  if (process.platform === 'win32') {
    // No Windows, usar LOCALAPPDATA que é mais confiável
    const localAppData = process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
    userCacheDir = path.join(localAppData, '.puppeteer_cache');
  } else {
    // Linux/Mac: usar cache padrão
    const defaultCacheDir = path.join(os.homedir(), '.cache', 'puppeteer');
    const fallbackCacheDir = path.join(os.homedir(), '.puppeteer_cache');
    userCacheDir = fs.existsSync(defaultCacheDir) ? defaultCacheDir : fallbackCacheDir;
  }
  
  process.env.PUPPETEER_CACHE_DIR = userCacheDir;
  
  // Criar diretório de cache se não existir
  if (!fs.existsSync(userCacheDir)) {
    try {
      fs.mkdirSync(userCacheDir, { recursive: true });
      console.log(`[PUPPETEER] Cache do Puppeteer criado em: ${userCacheDir}`);
    } catch (error: any) {
      // Fallback para diretório do projeto
      const fallbackPath = path.join(process.cwd(), '.puppeteer_cache');
      try {
        fs.mkdirSync(fallbackPath, { recursive: true });
        process.env.PUPPETEER_CACHE_DIR = fallbackPath;
        console.log(`[PUPPETEER] Cache do Puppeteer criado em fallback: ${fallbackPath}`);
      } catch (fallbackError: any) {
        console.error(`[PUPPETEER] Erro ao criar cache: ${fallbackError.message}`);
      }
    }
  } else {
    console.log(`[PUPPETEER] Cache do Puppeteer encontrado em: ${userCacheDir}`);
  }
} else {
  console.log(`[PUPPETEER] Cache do Puppeteer configurado via env: ${process.env.PUPPETEER_CACHE_DIR}`);
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import documentRoutes from './routes/document.routes';
import conversationRoutes from './routes/conversation.routes';
import agentConfigRoutes from './routes/agentConfig.routes';
import mediaRoutes from './routes/media.routes';
import topicRoutes from './routes/topic.routes';
import indexingRoutes from './routes/indexing.routes';
import testChatRoutes from './routes/testChat.routes';
import ollamaRoutes from './routes/ollama.routes';
import humanAttendantRoutes from './routes/humanAttendant.routes';
import vmLavRoutes from './routes/vmLav.routes';
import fidelizacaoRoutes from './routes/fidelizacao.routes';
import { initDatabase } from './utils/initDatabase';
import { WhatsAppManager } from './services/whatsapp.manager';
import { chromaManager } from './utils/chromaManager';
import { iniciarScheduler } from './utils/vmLavScheduler';
import jwt from 'jsonwebtoken';

// Carregar variáveis de ambiente
dotenv.config();

// Tratamento de erros não capturados para evitar que o servidor encerre
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection:', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise,
  });
  // Não encerrar o servidor - apenas logar o erro
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
  });
  // Não encerrar o servidor - apenas logar o erro
  // Em produção, você pode querer encerrar o servidor após logar
  // mas para desenvolvimento, é melhor manter rodando
});

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
  // Permitir conexões mesmo com erros de autenticação para melhor tratamento
  allowEIO3: true,
  // Adicionar logs de conexão
  transports: ['websocket', 'polling'],
});

// Tratamento de erros de conexão
io.engine.on('connection_error', (err) => {
  logger.error(`Erro de conexão Socket.IO: ${err.message}`, {
    req: err.req,
    code: err.code,
    context: err.context,
  });
});

const PORT = process.env.PORT || 3301;

// Middleware
// Configuração de CORS mais permissiva para desenvolvimento
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
}));

// Tratar requisições OPTIONS (preflight)
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Rotas
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Agente Zap Backend está rodando',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/agent-config', agentConfigRoutes);
app.use('/api/medias', mediaRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/indexing', indexingRoutes);
app.use('/api/test-chat', testChatRoutes);
app.use('/api/ollama', ollamaRoutes);
app.use('/api/human-attendant', humanAttendantRoutes);
app.use('/api/vmlav', vmLavRoutes);
app.use('/api/fidelizacao', fidelizacaoRoutes);

// Error handlers (devem ser os últimos middlewares)
app.use(notFoundHandler);
app.use(errorHandler);

// Socket.IO connection
io.use(async (socket: Socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    logger.debug(`Tentativa de conexão Socket.IO - Token presente: ${!!token}, Socket ID: ${socket.id}`);
    
    if (!token) {
      logger.warn(`Conexão Socket.IO rejeitada: Token não fornecido. Socket ID: ${socket.id}`);
      // Usar um objeto de erro mais específico para evitar "Invalid namespace"
      const error = new Error('Token não fornecido') as any;
      error.data = { code: 'AUTH_REQUIRED' };
      return next(error);
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'default-secret'
      ) as { userId: number };

      (socket as any).userId = decoded.userId;
      logger.debug(`Conexão Socket.IO autenticada - Usuário: ${decoded.userId}, Socket ID: ${socket.id}`);
      next();
    } catch (jwtError: any) {
      logger.warn(`Conexão Socket.IO rejeitada: Token inválido. Erro: ${jwtError.message}, Socket ID: ${socket.id}`);
      // Usar um objeto de erro mais específico para evitar "Invalid namespace"
      const error = new Error(`Token inválido: ${jwtError.message}`) as any;
      error.data = { code: 'AUTH_FAILED', reason: jwtError.message };
      return next(error);
    }
  } catch (error: any) {
    logger.error(`Erro inesperado no middleware Socket.IO: ${error.message}, Socket ID: ${socket.id}`);
    // Usar um objeto de erro mais específico para evitar "Invalid namespace"
    const authError = new Error(`Erro de autenticação: ${error.message}`) as any;
    authError.data = { code: 'AUTH_ERROR' };
    return next(authError);
  }
});

io.on('connection', async (socket: Socket) => {
  const userId = (socket as any).userId;
  
  if (!userId) {
    logger.error(`Conexão Socket.IO sem userId - Socket ID: ${socket.id}`);
    socket.disconnect();
    return;
  }
  
  logger.info(`Cliente conectado: ${socket.id} (usuário: ${userId})`);

  // Inicializar serviço WhatsApp e conectar eventos
  const whatsappManager = WhatsAppManager.getInstance();
  const service = await whatsappManager.getService(userId);

  // Enviar status atual quando conectar
  try {
    const currentStatus = await service.getStatus();
    // IMPORTANTE: getQRCode() agora valida e limpa QR codes expirados automaticamente
    let currentQRCode = await service.getQRCode();
    const isReady = service.isReady();
    
    // Tratar caso onde o banco retorna string "null"
    if (currentQRCode === 'null' || currentQRCode === '' || (typeof currentQRCode === 'string' && currentQRCode.trim() === '')) {
      currentQRCode = null;
    }
    
    logger.debug(`Enviando status atual para socket ${socket.id}: status=${currentStatus}, isReady=${isReady}, qrCode=${currentQRCode ? 'presente' : 'null'}`);
    
    // Se está pronto, enviar evento ready
    if (isReady && currentStatus === 'connected') {
      socket.emit('whatsapp:ready', { status: 'connected' });
    }
    // Se tem QR code válido (não expirado), enviar
    // Incluir 'connection_failed' pois o usuário pode querer reconectar
    else if (currentQRCode && currentQRCode !== 'null' && (currentStatus === 'connecting' || currentStatus === 'disconnected' || currentStatus === 'connection_failed')) {
      socket.emit('whatsapp:qr', { qr: currentQRCode });
    }
    // Se não tem QR code mas está em estado connecting, pode ser que o QR code expirou
    // Não enviar nada - o cliente deve gerar um novo QR code
    else if (currentStatus === 'connecting' && !currentQRCode) {
      logger.debug(`Status 'connecting' mas sem QR code válido para socket ${socket.id}. Aguardando novo QR code...`);
    }
  } catch (error: any) {
    logger.debug(`Erro ao buscar status atual: ${error.message}`);
  }

  // Função para emitir para todos os sockets do usuário
  const emitToUserSockets = async (event: string, data: any) => {
    try {
      // Encontrar todos os sockets deste usuário
      const sockets = await io.fetchSockets();
      const userSockets = sockets.filter(s => (s as any).userId === userId);
      
      logger.debug(`Emitindo evento '${event}' para ${userSockets.length} socket(s) do usuário ${userId}`);
      userSockets.forEach(s => {
        s.emit(event, data);
      });
    } catch (error: any) {
      logger.error(`Erro ao emitir evento '${event}' para sockets do usuário ${userId}: ${error.message}`);
      // Fallback: emitir apenas para o socket atual
      socket.emit(event, data);
    }
  };

  // Configurar eventos do WhatsApp para Socket.IO
  // ✅ CRÍTICO: Não remover listeners indiscriminadamente
  // Apenas adicionar listeners se ainda não existirem para este serviço
  // Isso evita conflitos quando múltiplos sockets conectam/desconectam
  
  const hasQrListener = service.listenerCount('qr') > 0;
  const hasReadyListener = service.listenerCount('ready') > 0;
  const hasAuthListener = service.listenerCount('authenticated') > 0;
  
  if (!hasQrListener || !hasReadyListener || !hasAuthListener) {
    logger.debug(`Configurando listeners para usuário ${userId} (qr: ${hasQrListener}, ready: ${hasReadyListener}, auth: ${hasAuthListener})`);
  }
  
  // Só adicionar listeners se não existirem
  if (!hasQrListener) {
    service.on('qr', (qr) => {
      logger.debug(`Emitindo evento whatsapp:qr para usuário ${userId}`);
      emitToUserSockets('whatsapp:qr', { qr });
    });

    service.on('qr_expired', () => {
      logger.debug(`Emitindo evento whatsapp:qr_expired para usuário ${userId}`);
      emitToUserSockets('whatsapp:qr_expired', {});
    });
  }

  if (!hasReadyListener) {
    service.on('ready', async () => {
      logger.debug(`Evento ready recebido para usuário ${userId}`);
      // Enviar status atualizado quando ficar pronto
      try {
        const _status = await service.getStatus();
        emitToUserSockets('whatsapp:ready', { status: 'connected' });
        logger.debug(`Status 'connected' enviado para usuário ${userId}`);
      } catch (error: any) {
        logger.error(`Erro ao obter status no evento ready: ${error.message}`);
        emitToUserSockets('whatsapp:ready', { status: 'connected' });
      }
    });
  }

  if (!hasAuthListener) {
    service.on('authenticated', () => {
      emitToUserSockets('whatsapp:authenticated', { status: 'authenticated' });
    });

    service.on('auth_failure', (msg) => {
      emitToUserSockets('whatsapp:auth_failure', { error: msg });
    });

    service.on('disconnected', (reason) => {
      emitToUserSockets('whatsapp:disconnected', { reason });
    });
  }

  // Adicionar listeners de mensagem e reação apenas se não existirem
  if (service.listenerCount('message') === 0) {
    service.on('message', (data) => {
      logger.debug(`Evento 'message' recebido do WhatsAppService para usuário ${userId}:`, {
        conversationId: data.conversationId,
        messageId: data.message?.id,
        direction: data.message?.direction,
      });
      // Emitir para todos os sockets do usuário (não apenas o socket atual)
      emitToUserSockets('whatsapp:message', data);
    });

    service.on('reaction', (data) => {
      logger.debug(`Evento 'reaction' recebido do WhatsAppService para usuário ${userId}:`, {
        messageId: data.messageId,
        reactionEmoji: data.reactionEmoji,
      });
      // Emitir evento de reação para atualizar o frontend
      emitToUserSockets('whatsapp:reaction', data);
    });

    service.on('message_ack', (data) => {
      logger.debug(`Evento 'message_ack' recebido do WhatsAppService para usuário ${userId}:`, {
        messageId: data.messageId,
        ack: data.ack,
      });
      // Emitir evento de ack para atualizar o frontend
      emitToUserSockets('whatsapp:message_ack', data);
    });

    service.on('state_changed', (state) => {
      emitToUserSockets('whatsapp:state_changed', { state });
    });

    service.on('loading', (data) => {
      emitToUserSockets('whatsapp:loading', data);
    });
  }

  // Eventos do cliente
  socket.on('whatsapp:initialize', async () => {
    try {
      await whatsappManager.initializeService(userId);
      socket.emit('whatsapp:initialized', { status: 'ok' });
    } catch (error: any) {
      socket.emit('whatsapp:error', { error: error.message });
    }
  });

  socket.on('whatsapp:get_status', async () => {
    try {
      const status = await service.getStatus();
      const qrCode = await service.getQRCode();
      socket.emit('whatsapp:status', { status, qrCode, isReady: service.isReady() });
    } catch (error: any) {
      socket.emit('whatsapp:error', { error: error.message });
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Cliente desconectado: ${socket.id} (usuário: ${userId})`);
  });
});

// Inicializar banco de dados e iniciar servidor
initDatabase()
  .then(async () => {
    // Inicializar ChromaDB
    try {
      logger.info('🔍 Iniciando ChromaDB...');
      await chromaManager.start();
      const status = await chromaManager.getStatus();
      logger.info(`✅ ChromaDB disponível em ${status.url}`);
      if (status.managedByBackend) {
        logger.info('   (gerenciado pelo backend)');
      } else {
        logger.info('   (servidor externo)');
      }
    } catch (error: any) {
      logger.warn('⚠️  Não foi possível iniciar ChromaDB automaticamente');
      logger.warn(`   ${error.message}`);
      logger.warn('   O sistema continuará, mas funcionalidades de indexação podem não funcionar');
      logger.warn('   Inicie manualmente: chroma run --host localhost --port 8000 --path ./chroma_db');
    }

    // Inicializar sessões WhatsApp ativas ao iniciar o servidor
    // Isso mantém as sessões ativas mesmo após reiniciar o servidor
    // Reconecta automaticamente todas as sessões que têm arquivos de sessão válidos
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { WhatsAppSessionModel } = await import('./models/whatsappSession.model');
      const sessionModel = new WhatsAppSessionModel();
      
      const sessionPath = process.env.WHATSAPP_SESSION_PATH || './whatsapp_sessions';
      
      logger.info('🔄 Verificando sessões WhatsApp para reconexão automática...');
      
      // ✅ NOVA LÓGICA: Buscar TODAS as sessões (1 por usuário devido ao UNIQUE constraint)
      // O WhatsAppManager vai verificar se já existe um cliente ativo em memória
      const allSessions = await sessionModel.findAll();
      
      if (allSessions.length === 0) {
        logger.info('ℹ️  Nenhuma sessão WhatsApp encontrada no banco de dados');
      } else {
        logger.info(`📋 Encontrada(s) ${allSessions.length} sessão(ões) no banco de dados`);
        const whatsappManager = WhatsAppManager.getInstance();
        
        let reconnectedCount = 0;
        let skippedCount = 0;
        
        for (const session of allSessions) {
          try {
            // Verificar se já existe um cliente ativo em memória para este usuário
            const existingService = whatsappManager.getServiceSync(session.user_id);
            if (existingService && existingService.isReady()) {
              logger.debug(`[Auto Reconnect] User ${session.user_id}: Cliente já ativo em memória. Pulando.`);
              skippedCount++;
              continue;
            }
            
            // Verificar caminhos de sessão
            const userSessionPath = path.join(sessionPath, `user_${session.user_id}`);
            const clientId = `user_${session.user_id}`;
            const localAuthPath = path.join(userSessionPath, `session-${clientId}`);
            
            logger.info(`[Auto Reconnect] User ${session.user_id}: Status=${session.status}, Verificando arquivos...`);
            
            // Verificar se o diretório base existe
            if (!fs.existsSync(userSessionPath)) {
              logger.debug(`[Auto Reconnect] User ${session.user_id}: Diretório de sessão não existe. Pulando.`);
              continue;
            }

            // Verificar arquivos de sessão
            let hasValidFiles = false;
            let fileCount = 0;
            
            if (fs.existsSync(localAuthPath)) {
              try {
                const sessionFiles = fs.readdirSync(localAuthPath);
                fileCount = sessionFiles.length;
                
                // Verificar perfil Default
                const defaultProfilePath = path.join(localAuthPath, 'Default');
                const hasDefaultProfile = fs.existsSync(defaultProfilePath) && fs.statSync(defaultProfilePath).isDirectory();
                
                // Considerar válido se tiver perfil Default e arquivos
                hasValidFiles = hasDefaultProfile && sessionFiles.length > 0;
                
                logger.debug(`[Auto Reconnect] User ${session.user_id}: ${fileCount} arquivos, hasDefaultProfile=${hasDefaultProfile}, hasValidFiles=${hasValidFiles}`);
              } catch (error: any) {
                logger.warn(`[Auto Reconnect] User ${session.user_id}: Erro ao ler diretório: ${error.message}`);
              }
            }

            // ✅ NOVA REGRA: Se tem arquivos válidos, SEMPRE tentar reconectar
            // Não importa há quanto tempo foi a última conexão - os arquivos são a fonte da verdade
            if (hasValidFiles) {
              logger.info(`✅ User ${session.user_id}: ${fileCount} arquivos de sessão encontrados. Reconectando...`);
              
              // Aguardar antes de inicializar para evitar race conditions
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Atualizar status para 'connecting' antes de tentar
              await sessionModel.updateByUserId(session.user_id, {
                status: 'connecting',
              });
              
              // Tentar reconectar
              await whatsappManager.initializeService(session.user_id);
              reconnectedCount++;
              
              logger.info(`✅ User ${session.user_id}: Reconexão iniciada com sucesso`);
              
              // Aguardar entre reconexões
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              logger.debug(`[Auto Reconnect] User ${session.user_id}: Sem arquivos de sessão válidos. Pulando.`);
              
              // Se status está como 'connected' mas não há arquivos, corrigir para 'connection_failed'
              // Usar 'connection_failed' pois não foi desconexão manual do usuário
              if (session.status === 'connected') {
                logger.warn(`[Auto Reconnect] User ${session.user_id}: Status 'connected' mas sem arquivos. Corrigindo para 'connection_failed'.`);
                await sessionModel.updateByUserId(session.user_id, {
                  status: 'connection_failed',
                  qr_code: undefined,
                });
              }
            }
          } catch (error: any) {
            logger.error(`[Auto Reconnect] User ${session.user_id}: Erro - ${error.message}`);
          }
        }
        
        // Resumo
        logger.info('='.repeat(60));
        logger.info(`📊 RESUMO DA RECONEXÃO AUTOMÁTICA:`);
        logger.info(`   - Sessões verificadas: ${allSessions.length}`);
        logger.info(`   - Reconexões iniciadas: ${reconnectedCount}`);
        logger.info(`   - Já conectados: ${skippedCount}`);
        logger.info(`   - Sem arquivos válidos: ${allSessions.length - reconnectedCount - skippedCount}`);
        logger.info('='.repeat(60));
      }
    } catch (error: any) {
      logger.warn(`Erro ao inicializar sessões WhatsApp: ${error.message}`);
      // Não bloquear inicialização do servidor
    }

    // Inicializar job de finalização automática de conversas antigas
    try {
      const { ConversationService } = await import('./services/conversation.service');
      const conversationService = new ConversationService();
      
      // Executar imediatamente na inicialização
      logger.info('Executando verificação inicial de conversas antigas (>12h)...');
      const initialCount = await conversationService.finalizeOldConversations();
      if (initialCount > 0) {
        logger.info(`✅ ${initialCount} conversa(s) finalizada(s) na inicialização`);
      }
      
      // Executar periodicamente a cada hora (3600000 ms)
      const FINALIZE_INTERVAL_MS = 60 * 60 * 1000; // 1 hora
      setInterval(async () => {
        try {
          logger.info('Executando verificação periódica de conversas antigas (>12h)...');
          const count = await conversationService.finalizeOldConversations();
          if (count > 0) {
            logger.info(`✅ ${count} conversa(s) finalizada(s) automaticamente`);
          } else {
            logger.debug('Nenhuma conversa antiga encontrada para finalizar');
          }
        } catch (error: any) {
          logger.error(`Erro ao executar finalização automática de conversas: ${error.message}`);
        }
      }, FINALIZE_INTERVAL_MS);
      
      logger.info(`🔄 Job de finalização automática configurado (executa a cada ${FINALIZE_INTERVAL_MS / 1000 / 60} minutos)`);
    } catch (error: any) {
      logger.warn(`Erro ao configurar job de finalização automática: ${error.message}`);
      // Não bloquear inicialização do servidor se houver erro
    }

    // Inicializar scheduler VM Lav (sincronização a cada 10 minutos)
    try {
      iniciarScheduler();
    } catch (error: any) {
      logger.warn(`Erro ao configurar scheduler VM Lav: ${error.message}`);
      // Não bloquear inicialização do servidor se houver erro
    }

    // Inicializar VmLavConnectionManager em background (não bloquear servidor)
    try {
      const { getVmLavConnectionManager } = await import('./services/vmLavConnectionManager.service');
      const vmLavConnectionManager = getVmLavConnectionManager();
      
      // ✅ NÃO USAR AWAIT - deixar inicializar em background para não bloquear o servidor
      vmLavConnectionManager.initialize()
        .then(() => {
          logger.info('✅ VmLavConnectionManager inicializado');
        })
        .catch((error: any) => {
          logger.warn(`⚠️  Erro ao inicializar VmLavConnectionManager: ${error.message}`);
          logger.warn('   O sistema continuará, mas renovação automática de tokens pode não funcionar');
        });
    } catch (error: any) {
      logger.warn(`⚠️  Erro ao importar VmLavConnectionManager: ${error.message}`);
      logger.warn('   O sistema continuará, mas renovação automática de tokens pode não funcionar');
    }

    // ✅ Health Check periódico para verificar consistência das sessões WhatsApp
    // Executa a cada 30 minutos e corrige inconsistências entre banco e memória
    const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutos
    
    setInterval(async () => {
      try {
        const { WhatsAppSessionModel } = await import('./models/whatsappSession.model');
        const sessionModel = new WhatsAppSessionModel();
        const sessions = await sessionModel.findAll();
        
        // ✅ Obter instância do WhatsAppManager dentro do health check
        const whatsappManager = WhatsAppManager.getInstance();
        
        let inconsistencies = 0;
        
        for (const session of sessions) {
          const service = whatsappManager.getServiceSync(session.user_id);
          
          // Caso 1: Banco diz 'connected' mas não há cliente em memória ou não está pronto
          // Usar 'connection_failed' para indicar problema técnico (não desconexão manual)
          if (session.status === 'connected') {
            if (!service || !service.isReady()) {
              logger.warn(`[Health Check] User ${session.user_id}: Banco='connected' mas cliente não ativo. Corrigindo para 'connection_failed'...`);
              await sessionModel.updateByUserId(session.user_id, {
                status: 'connection_failed',
              });
              inconsistencies++;
            }
          }
          
          // Caso 2: Cliente está pronto mas banco não reflete isso
          if (service && service.isReady() && session.status !== 'connected') {
            logger.warn(`[Health Check] User ${session.user_id}: Cliente ativo mas banco='${session.status}'. Corrigindo...`);
            await sessionModel.updateByUserId(session.user_id, {
              status: 'connected',
              last_connected_at: new Date(),
            });
            inconsistencies++;
          }
        }
        
        if (inconsistencies > 0) {
          logger.info(`[Health Check] ${inconsistencies} inconsistência(s) corrigida(s)`);
        } else {
          logger.debug(`[Health Check] Todas as ${sessions.length} sessão(ões) estão consistentes`);
        }
      } catch (error: any) {
        logger.error(`[Health Check] Erro: ${error.message}`);
      }
    }, HEALTH_CHECK_INTERVAL);
    
    logger.info(`🔍 Health Check de sessões WhatsApp configurado (a cada ${HEALTH_CHECK_INTERVAL / 60000} minutos)`);

    // Iniciar servidor HTTP imediatamente (não aguardar VmLav)
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Servidor rodando na porta ${PORT}`);
      logger.info(`📡 Socket.IO disponível`);
      logger.info(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 API disponível em http://localhost:${PORT}/api`);
    });
  })
  .catch((error) => {
    logger.error(`❌ Erro ao inicializar servidor: ${error.message}`);
    process.exit(1);
  });

// Shutdown gracioso
const shutdown = async () => {
  logger.info('🛑 Encerrando servidor...');
  
  // Encerrar ChromaDB se foi iniciado pelo backend
  try {
    await chromaManager.stop();
  } catch (error: any) {
    logger.error(`Erro ao encerrar ChromaDB: ${error.message}`);
  }
  
  // Fechar servidor HTTP
  httpServer.close(() => {
    logger.info('✅ Servidor encerrado');
    process.exit(0);
  });
  
  // Forçar encerramento após 10 segundos
  setTimeout(() => {
    logger.error('⚠️  Forçando encerramento após timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, io };


