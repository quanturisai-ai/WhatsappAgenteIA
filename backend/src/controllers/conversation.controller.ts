import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { ConversationService } from '../services/conversation.service';
import { WhatsAppManager } from '../services/whatsapp.manager';
import { ConversationModel } from '../models/conversation.model';
import { MessageModel } from '../models/message.model';
import { MediaModel } from '../models/media.model';
import pool from '../config/database';
import logger from '../utils/logger';

const conversationService = new ConversationService();
const conversationModel = new ConversationModel();
const messageModel = new MessageModel();
const mediaModel = new MediaModel();

export const listConversations = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    // Finalizar conversas antigas antes de listar (para garantir que estão atualizadas)
    try {
      await conversationService.finalizeOldConversations();
    } catch (error: any) {
      logger.warn(`Erro ao finalizar conversas antigas ao listar: ${error.message}`);
      // Continuar mesmo se houver erro na finalização
    }

    const { status, search } = req.query;
    let conversations: any[];
    
    // Se houver termo de busca, usar busca específica
    if (search && typeof search === 'string' && search.trim()) {
      conversations = await conversationModel.searchByTerm(userId, search.trim());
    } else {
      conversations = await conversationModel.findByUserId(userId);
    }

    // Garantir que conversations seja sempre um array
    if (!Array.isArray(conversations)) {
      logger.warn(`findByUserId retornou um valor não-array para usuário ${userId}. Tipo: ${typeof conversations}`);
      conversations = [];
    }

    // Filtrar por status se fornecido
    if (status) {
      conversations = conversations.filter((c) => c.status === status);
    }

    // Enriquecer com informações adicionais
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv) => {
        try {
          // Converter auto_responding do banco (0/1 ou null) para boolean
          let isAutoResponding = true; // Default: ativo
          if (conv.auto_responding !== null && conv.auto_responding !== undefined) {
            if (typeof conv.auto_responding === 'number') {
              isAutoResponding = conv.auto_responding === 1;
            } else {
              isAutoResponding = conv.auto_responding === true;
            }
          }
          
          const messageCount = await messageModel.countByConversation(conv.id);
          
          // Buscar última mensagem da conversa (ordenar por created_at DESC para pegar a mais recente)
          // Filtrar mensagens que tenham conteúdo válido (não vazio e não apenas placeholders)
          const conn = await pool.getConnection();
          let lastMessage: string | undefined;
          try {
            // Primeiro verificar quantas mensagens existem
            const countQueryResult = await conn.query(
              'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
              [conv.id]
            ) as any;
            // MariaDB retorna [rows, metadata] ou apenas rows dependendo da versão
            const countRows = Array.isArray(countQueryResult) && Array.isArray(countQueryResult[0]) 
              ? countQueryResult[0] 
              : (Array.isArray(countQueryResult) ? countQueryResult : [countQueryResult]);
            const totalCount = countRows && countRows.length > 0 ? countRows[0].total : 0;
            logger.debug(`Conversa ${conv.id}: total de mensagens no banco: ${totalCount}`);
            
            if (totalCount === 0) {
              logger.debug(`Conversa ${conv.id}: nenhuma mensagem encontrada no banco`);
            } else {
              // Buscar diretamente a última mensagem (mais simples e eficiente)
              // Primeiro tentar buscar mensagens com conteúdo válido (não placeholders)
              const queryResult = await conn.query(
                `SELECT content, message_type 
                 FROM messages 
                 WHERE conversation_id = ? 
                   AND content IS NOT NULL 
                   AND content != '' 
                   AND content NOT LIKE '[media]'
                   AND content NOT LIKE '[location]'
                   AND content NOT LIKE '[contact]'
                   AND content NOT LIKE '[system]'
                   AND content NOT LIKE '[other]'
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [conv.id]
              ) as any;
              
              // MariaDB retorna [rows, metadata] ou apenas rows dependendo da versão
              const rows = Array.isArray(queryResult) && Array.isArray(queryResult[0]) 
                ? queryResult[0] 
                : (Array.isArray(queryResult) ? queryResult : [queryResult]);
              
              logger.debug(`Conversa ${conv.id}: primeira query retornou ${rows?.length || 0} resultado(s)`);
              
              // Se não encontrou, buscar qualquer mensagem com conteúdo (incluindo placeholders)
              if (!rows || rows.length === 0 || !rows[0] || !rows[0].content) {
                logger.debug(`Conversa ${conv.id}: tentando buscar qualquer mensagem com conteúdo...`);
                const fallbackQueryResult = await conn.query(
                  `SELECT content, message_type 
                   FROM messages 
                   WHERE conversation_id = ? 
                     AND content IS NOT NULL 
                     AND content != ''
                   ORDER BY created_at DESC 
                   LIMIT 1`,
                  [conv.id]
                ) as any;
                
                // MariaDB retorna [rows, metadata] ou apenas rows dependendo da versão
                const fallbackRows = Array.isArray(fallbackQueryResult) && Array.isArray(fallbackQueryResult[0]) 
                  ? fallbackQueryResult[0] 
                  : (Array.isArray(fallbackQueryResult) ? fallbackQueryResult : [fallbackQueryResult]);
                
                logger.debug(`Conversa ${conv.id}: segunda query retornou ${fallbackRows?.length || 0} resultado(s)`);
                
                if (fallbackRows && fallbackRows.length > 0 && fallbackRows[0] && fallbackRows[0].content) {
                  lastMessage = String(fallbackRows[0].content || '').trim();
                  // Limitar a 50 caracteres e adicionar ... se ultrapassar
                  if (lastMessage.length > 50) {
                    lastMessage = lastMessage.substring(0, 50) + '...';
                  }
                  logger.debug(`Conversa ${conv.id}: última mensagem encontrada (fallback): "${lastMessage}"`);
                } else {
                  // Debug: ver todas as mensagens para entender o problema
                  const allQueryResult = await conn.query(
                    `SELECT id, content, message_type, created_at 
                     FROM messages 
                     WHERE conversation_id = ? 
                     ORDER BY created_at DESC 
                     LIMIT 5`,
                    [conv.id]
                  ) as any;
                  
                  // MariaDB retorna [rows, metadata] ou apenas rows dependendo da versão
                  const allRows = Array.isArray(allQueryResult) && Array.isArray(allQueryResult[0]) 
                    ? allQueryResult[0] 
                    : (Array.isArray(allQueryResult) ? allQueryResult : [allQueryResult]);
                  
                  logger.debug(`Conversa ${conv.id}: debug - todas as mensagens:`, {
                    count: allRows?.length || 0,
                    messages: allRows?.map((r: any) => ({
                      id: r.id,
                      content: r.content ? r.content.substring(0, 30) : null,
                      contentLength: r.content?.length || 0,
                      messageType: r.message_type,
                      isEmpty: !r.content || r.content.trim() === '',
                    })),
                  });
                }
              } else {
                lastMessage = String(rows[0].content || '').trim();
                // Limitar a 50 caracteres e adicionar ... se ultrapassar
                if (lastMessage.length > 50) {
                  lastMessage = lastMessage.substring(0, 50) + '...';
                }
                logger.debug(`Conversa ${conv.id}: última mensagem encontrada: "${lastMessage}"`);
              }
            }
          } catch (error: any) {
            logger.error(`Erro ao buscar última mensagem da conversa ${conv.id}: ${error.message}`);
            logger.error(`Stack trace: ${error.stack}`);
          } finally {
            conn.release();
          }
          
          // Converter needs_intervention do banco (0/1 ou null) para boolean
          let needsIntervention = false;
          if (conv.needs_intervention !== null && conv.needs_intervention !== undefined) {
            if (typeof conv.needs_intervention === 'number') {
              needsIntervention = conv.needs_intervention === 1;
            } else {
              needsIntervention = conv.needs_intervention === true;
            }
          }

          // Log para debug: verificar contact_name
          logger.info(`Conversa ${conv.id}: contact_name="${conv.contact_name || 'NULL'}", contact_number="${conv.contact_number}"`);
          
          const enrichedConv = {
            id: conv.id,
            contactNumber: conv.contact_number,
            contactName: conv.contact_name && conv.contact_name.trim() !== '' ? conv.contact_name.trim() : null, // Garantir que seja null se vazio/undefined
            status: conv.status,
            lastMessageAt: conv.last_message_at,
            lastMessage: lastMessage || undefined, // Garantir que seja undefined se vazio
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            isAutoResponding,
            messageCount,
            needsIntervention,
            interventionResolvedAt: conv.intervention_resolved_at || null,
          };
          
          // Log do resultado final
          logger.debug(`Conversa ${conv.id} enriquecida: contactName="${enrichedConv.contactName || 'NULL'}", contactNumber="${enrichedConv.contactNumber}"`);
          
          // Log para debug
          if (lastMessage) {
            logger.debug(`Conversa ${conv.id}: última mensagem encontrada: "${lastMessage.substring(0, 30)}..."`);
          } else {
            logger.debug(`Conversa ${conv.id}: nenhuma mensagem válida encontrada`);
          }
          
          return enrichedConv;
        } catch (error: any) {
          logger.error(`Erro ao enriquecer conversa ${conv.id}: ${error.message}`);
          // Retornar conversa sem informações adicionais em caso de erro
          return {
            id: conv.id,
            contactNumber: conv.contact_number,
            contactName: conv.contact_name,
            status: conv.status,
            lastMessageAt: conv.last_message_at,
            createdAt: conv.created_at,
            updatedAt: conv.updated_at,
            isAutoResponding: false,
            messageCount: 0,
            needsIntervention: false,
            interventionResolvedAt: null,
          };
        }
      })
    );

    logger.info(`Listando ${enrichedConversations.length} conversas para usuário ${userId}`);
    
    res.json({
      conversations: enrichedConversations,
    });
  } catch (error: any) {
    logger.error(`Erro ao listar conversas: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    // Em caso de erro, retornar array vazio em vez de quebrar
    res.json({
      conversations: [],
    });
  }
};

export const getConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const conversation = await conversationModel.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      const appError: AppError = new Error('Conversa não encontrada');
      appError.statusCode = 404;
      throw appError;
    }

    // Buscar todas as mensagens sem limite de tempo para visualização no dashboard
    // Passar undefined para maxAgeHours para desabilitar o filtro de tempo
    const messages = await messageModel.findByConversationId(conversationId, 1000, undefined);
    const _status = await conversationService.getConversationStatus(conversationId);

    // Garantir que messages seja sempre um array
    const messagesArray = Array.isArray(messages) ? messages : [];

    logger.debug(`getConversation - conversationId=${conversationId}, messages encontradas=${messagesArray.length}`);
    
    if (messagesArray.length > 0) {
      logger.debug(`Primeira mensagem: id=${messagesArray[0].id}, content="${messagesArray[0].content?.substring(0, 50)}...", direction=${messagesArray[0].direction}, created_at=${messagesArray[0].created_at}`);
    }

    // Buscar todas as mídias de uma vez para otimizar
    const mediaIds = messagesArray
      .filter(msg => {
        const hasMedia = msg.message_type === 'media' && msg.media_id;
        if (hasMedia) {
          logger.debug(`Mensagem de mídia encontrada: id=${msg.id}, media_id=${msg.media_id}, tipo=${typeof msg.media_id}`);
        }
        return hasMedia;
      })
      .map(msg => {
        // Converter media_id para número se necessário (pode vir como string do banco)
        const mediaId = typeof msg.media_id === 'string' ? parseInt(msg.media_id, 10) : Number(msg.media_id);
        if (isNaN(mediaId)) {
          logger.warn(`media_id inválido na mensagem ${msg.id}: ${msg.media_id}`);
          return null;
        }
        return mediaId;
      })
      .filter((id): id is number => id !== null && !isNaN(id))
      .filter((id, index, self) => self.indexOf(id) === index); // Remover duplicatas
    
    logger.debug(`Mídias encontradas para buscar: ${mediaIds.length} IDs únicos: ${mediaIds.join(', ')}`);
    
    const mediasMap = new Map<number, any>();
    if (mediaIds.length > 0) {
      for (const mediaId of mediaIds) {
        try {
          logger.debug(`Buscando mídia ID: ${mediaId}`);
          const media = await mediaModel.findById(mediaId);
          if (media) {
            logger.debug(`Mídia encontrada: id=${media.id}, user_id=${media.user_id}, userId=${userId}`);
            if (media.user_id === userId) {
              mediasMap.set(mediaId, media);
              logger.debug(`Mídia ${mediaId} adicionada ao Map`);
            } else {
              logger.warn(`Mídia ${mediaId} pertence ao usuário ${media.user_id}, mas a conversa é do usuário ${userId}`);
            }
          } else {
            logger.warn(`Mídia ${mediaId} não encontrada no banco`);
          }
        } catch (error: any) {
          logger.error(`Erro ao buscar mídia ${mediaId}: ${error.message}`);
        }
      }
    } else {
      logger.debug(`Nenhuma mensagem de mídia encontrada nas ${messagesArray.length} mensagens`);
    }

    const formattedMessages = await Promise.all(messagesArray.map(async (msg) => {
      // Converter created_at para string ISO se necessário
      let createdAt: string;
      if (msg.created_at instanceof Date) {
        createdAt = msg.created_at.toISOString();
      } else if (typeof msg.created_at === 'string') {
        createdAt = msg.created_at;
      } else if (msg.created_at) {
        // Tentar criar Date a partir do valor
        try {
          createdAt = new Date(msg.created_at).toISOString();
        } catch {
          createdAt = new Date().toISOString();
        }
      } else {
        createdAt = new Date().toISOString();
      }

      // Formatar reações se existirem
      // Garantir que reactions seja um array antes de usar .map()
      const reactionsArray = Array.isArray(msg.reactions) ? msg.reactions : (msg.reactions ? [msg.reactions] : []);
      const formattedReactions = reactionsArray.map((reaction) => ({
        id: reaction.id,
        messageId: reaction.message_id, // message_id da mensagem reagida (VARCHAR)
        reactionEmoji: reaction.reaction_emoji,
        reactedBy: reaction.reacted_by,
        createdAt: reaction.created_at instanceof Date 
          ? reaction.created_at.toISOString() 
          : typeof reaction.created_at === 'string' 
            ? reaction.created_at 
            : new Date().toISOString(),
      }));

      // Buscar informações da mídia se for mensagem de mídia
      let media = null;
      if (msg.message_type === 'media' && msg.media_id) {
        // Converter media_id para número se necessário
        const mediaId = typeof msg.media_id === 'string' ? parseInt(msg.media_id, 10) : Number(msg.media_id);
        
        if (!isNaN(mediaId)) {
          const mediaData = mediasMap.get(mediaId);
          if (mediaData) {
            // Converter BigInt para Number para evitar erro de serialização JSON
            const fileSize = typeof mediaData.file_size === 'bigint' 
              ? Number(mediaData.file_size) 
              : mediaData.file_size;
            
            media = {
              id: mediaData.id,
              filename: mediaData.filename,
              fileType: mediaData.file_type,
              fileSize: fileSize,
              title: mediaData.title,
              description: mediaData.description,
              caption: mediaData.caption,
            };
            logger.debug(`Mídia adicionada à mensagem ${msg.id}: media_id=${mediaId}, title=${mediaData.title}`);
          } else {
            logger.warn(`Mídia não encontrada no Map para mensagem ${msg.id}, media_id=${mediaId}`);
          }
        } else {
          logger.warn(`media_id inválido na mensagem ${msg.id}: ${msg.media_id}`);
        }
      }

      return {
        id: msg.id,
        messageId: msg.message_id || null, // message_id para identificar mensagens em eventos Socket.IO
        content: msg.content || '',
        messageType: msg.message_type || 'text',
        direction: msg.direction || 'incoming',
        isFromAi: msg.is_from_ai || false,
        createdAt,
        receivedAt: msg.received_at instanceof Date
          ? msg.received_at.toISOString()
          : typeof msg.received_at === 'string'
            ? msg.received_at
            : msg.received_at || null,
        readAt: msg.read_at instanceof Date
          ? msg.read_at.toISOString()
          : typeof msg.read_at === 'string'
            ? msg.read_at
            : msg.read_at || null,
        reactions: formattedReactions,
        media: media,
      };
    }));

    logger.debug(`Mensagens formatadas: ${formattedMessages.length} mensagens`);
    
    if (formattedMessages.length > 0) {
      logger.debug(`Exemplo de mensagem formatada:`, JSON.stringify(formattedMessages[0], null, 2));
    }

    // Converter needs_intervention do banco (0/1 ou null) para boolean
    let needsIntervention = false;
    if (conversation.needs_intervention !== null && conversation.needs_intervention !== undefined) {
      if (typeof conversation.needs_intervention === 'number') {
        needsIntervention = conversation.needs_intervention === 1;
      } else {
        needsIntervention = conversation.needs_intervention === true;
      }
    }

    // Converter auto_responding do banco (0/1 ou null) para boolean
    let isAutoResponding = true; // Default: ativo
    if (conversation.auto_responding !== null && conversation.auto_responding !== undefined) {
      if (typeof conversation.auto_responding === 'number') {
        isAutoResponding = conversation.auto_responding === 1;
      } else {
        isAutoResponding = conversation.auto_responding === true;
      }
    }

    // Buscar dados do cliente VM Lav se disponível
    let clienteData = null;
    if ((conversation as any).cliente_id) {
      clienteData = {
        id: (conversation as any).cliente_id,
        nomeCompleto: (conversation as any).cliente_nome_completo || null,
        cpf: (conversation as any).cliente_cpf || null,
        telefone: (conversation as any).cliente_telefone || null,
        email: (conversation as any).cliente_email || null,
        ultimaCompra: (conversation as any).cliente_ultima_compra 
          ? ((conversation as any).cliente_ultima_compra instanceof Date 
              ? (conversation as any).cliente_ultima_compra.toISOString() 
              : typeof (conversation as any).cliente_ultima_compra === 'string'
                ? (conversation as any).cliente_ultima_compra
                : null)
          : null,
        dataCadastro: (conversation as any).cliente_data_cadastro
          ? ((conversation as any).cliente_data_cadastro instanceof Date 
              ? (conversation as any).cliente_data_cadastro.toISOString() 
              : typeof (conversation as any).cliente_data_cadastro === 'string'
                ? (conversation as any).cliente_data_cadastro
                : null)
          : null,
        totalCompras: (conversation as any).cliente_total_compras || 0,
        valorTotalCompras: parseFloat((conversation as any).cliente_valor_total_compras) || 0,
      };
    }

    const response = {
      conversation: {
        id: conversation.id,
        contactNumber: conversation.contact_number,
        contactName: conversation.contact_name,
        status: conversation.status,
        lastMessageAt: conversation.last_message_at,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        isAutoResponding: isAutoResponding,
        needsIntervention,
        interventionResolvedAt: conversation.intervention_resolved_at || null,
        cliente: clienteData,
      },
      messages: formattedMessages,
    };

    logger.debug(`Resposta enviada: ${formattedMessages.length} mensagens para conversationId=${conversationId}`);
    
    res.json(response);
  } catch (error: any) {
    next(error);
  }
};

export const pauseAutoResponding = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    conversationService.pauseAutoResponding(conversationId);

    res.json({
      message: 'Respostas automáticas pausadas',
      conversationId,
    });
  } catch (error: any) {
    next(error);
  }
};

export const resumeAutoResponding = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    conversationService.resumeAutoResponding(conversationId);

    res.json({
      message: 'Respostas automáticas retomadas',
      conversationId,
    });
  } catch (error: any) {
    next(error);
  }
};

export const pauseAllConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    conversationService.pauseAllConversations(userId);

    res.json({
      message: 'Todas as respostas automáticas foram pausadas',
    });
  } catch (error: any) {
    next(error);
  }
};

export const resumeAllConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    conversationService.resumeAllConversations(userId);

    res.json({
      message: 'Todas as respostas automáticas foram retomadas',
    });
  } catch (error: any) {
    next(error);
  }
};

export const takeOverConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await conversationService.takeOverConversation(conversationId);

    res.json({
      message: 'Conversa assumida manualmente',
      conversationId,
    });
  } catch (error: any) {
    next(error);
  }
};

export const finishConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await conversationService.finishConversation(conversationId);

    res.json({
      message: 'Atendimento encerrado',
      conversationId,
    });
  } catch (error: any) {
    next(error);
  }
};

export const markIntervention = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    // Verificar se a conversa pertence ao usuário
    const conversation = await conversationModel.findById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      const appError: AppError = new Error('Conversa não encontrada ou não autorizada');
      appError.statusCode = 404;
      throw appError;
    }

    // Marcar conversa como precisa intervenção
    await conversationModel.update(conversationId, {
      needs_intervention: true,
      intervention_resolved_at: null, // Limpar data de resolução se houver
    });

    res.json({
      message: 'Pendência marcada com sucesso',
      conversationId,
    });
  } catch (error: any) {
    next(error);
  }
};

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { conversationId, content } = req.body;

    if (!conversationId || !content) {
      const appError: AppError = new Error('ID de conversa e conteúdo são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    const conversation = await conversationModel.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      const appError: AppError = new Error('Conversa não encontrada');
      appError.statusCode = 404;
      throw appError;
    }

    const whatsappManager = WhatsAppManager.getInstance();
    const whatsappService = whatsappManager.getServiceSync(userId);

    if (!whatsappService || !whatsappService.isReady()) {
      const appError: AppError = new Error('WhatsApp não está pronto');
      appError.statusCode = 400;
      throw appError;
    }

    // Enviar mensagem via WhatsApp
    // O handler handleOutgoingMessage() salvará a mensagem automaticamente no banco
    // quando o WhatsApp confirmar o envio, então não precisamos salvar manualmente aqui
    await whatsappService.sendMessage(conversation.contact_number, content);

    // A atualização de last_message_at também será feita pelo handleOutgoingMessage()

    res.json({
      message: 'Mensagem enviada com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const sendMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { conversationId, mediaId } = req.body;

    if (!conversationId || !mediaId) {
      const appError: AppError = new Error('ID de conversa e ID de mídia são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    const conversation = await conversationModel.findById(conversationId);

    if (!conversation || conversation.user_id !== userId) {
      const appError: AppError = new Error('Conversa não encontrada');
      appError.statusCode = 404;
      throw appError;
    }

    // Buscar mídia
    const media = await mediaModel.findById(mediaId);

    if (!media || media.user_id !== userId || media.status !== 'completed') {
      const appError: AppError = new Error('Mídia não encontrada ou não disponível');
      appError.statusCode = 404;
      throw appError;
    }

    const whatsappManager = WhatsAppManager.getInstance();
    const whatsappService = whatsappManager.getServiceSync(userId);

    if (!whatsappService || !whatsappService.isReady()) {
      const appError: AppError = new Error('WhatsApp não está pronto');
      appError.statusCode = 400;
      throw appError;
    }

    // Enviar mídia com caption cadastrado
    // isFromAI = false porque é o usuário que está enviando manualmente
    const caption = media.caption && media.caption.trim() ? media.caption.trim() : undefined;
    await whatsappService.sendMedia(conversation.contact_number, media.file_path, caption, false, mediaId);

    res.json({
      message: 'Mídia enviada com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const createConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { contactNumber, contactName } = req.body;

    if (!contactNumber) {
      const appError: AppError = new Error('Número de contato é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    // Normalizar número: remover caracteres não numéricos, remover 9 se existir, adicionar 55
    // Exemplo: (62) 98170-7783 → 556281707783 (remove o 9)
    // Exemplo: (62) 8170-7783 → 556281707783 (mantém sem 9)
    let normalizedNumber = contactNumber.replace(/\D/g, ''); // Remove caracteres não numéricos
    
    // Se o número tem 11 dígitos (DDD + 9 + número), remover o 9 (terceiro dígito)
    if (normalizedNumber.length === 11 && !normalizedNumber.startsWith('55')) {
      // Formato: DDD (2) + 9 (1) + número (8) = 11 dígitos
      // Remover o 9 (índice 2)
      normalizedNumber = normalizedNumber.slice(0, 2) + normalizedNumber.slice(3);
    } else if (normalizedNumber.length === 13 && normalizedNumber.startsWith('55')) {
      // Formato: 55 (2) + DDD (2) + 9 (1) + número (8) = 13 dígitos
      // Remover o 9 (índice 4)
      normalizedNumber = normalizedNumber.slice(0, 4) + normalizedNumber.slice(5);
    }
    
    // Adicionar 55 no início se não começar com 55
    if (!normalizedNumber.startsWith('55')) {
      normalizedNumber = '55' + normalizedNumber;
    }

    // Verificar se já existe uma conversa para este contato usando normalização de telefone
    const existing = await conversationModel.findByUserAndContactNormalized(userId, normalizedNumber);
    if (existing) {
      // Verificar se já existe alguma mensagem na conversa (interação prévia)
      const messageCount = await messageModel.countByConversation(existing.id);
      
      if (messageCount > 0) {
        // Já existe interação, retornar a conversa existente
        res.json({
          message: 'Conversa já existe com histórico de mensagens',
          conversation: existing,
        });
        return;
      }
      
      // Existe conversa mas sem mensagens, retornar a existente
      res.json({
        message: 'Conversa já existe',
        conversation: existing,
      });
      return;
    }

    // Criar nova conversa apenas se não existir nenhuma interação
    const conversation = await conversationModel.create({
      user_id: userId,
      contact_number: normalizedNumber, // Usar número normalizado (sem o 9)
      contact_name: contactName || null,
      status: 'new',
      auto_responding: false, // Iniciar com auto-responder desativado para conversa manual
      last_message_at: new Date(),
    });

    res.status(201).json({
      message: 'Conversa criada com sucesso',
      conversation,
    });
  } catch (error: any) {
    next(error);
  }
};

