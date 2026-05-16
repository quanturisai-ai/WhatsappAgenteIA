import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { RAGService } from '../services/rag.service';
import { AgentConfigModel } from '../models/agentConfig.model';
import { MediaModel } from '../models/media.model';
import { TestChatLogger } from '../utils/testChatLogger';
import logger from '../utils/logger';

const ragService = new RAGService();
const agentConfigModel = new AgentConfigModel();
const mediaModel = new MediaModel();

// Armazenar histórico de conversas de teste por usuário
const testConversations = new Map<number, Array<{ role: string; content: string }>>();

export const testChat = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { message, reset } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      const appError: AppError = new Error('Mensagem é obrigatória');
      appError.statusCode = 400;
      throw appError;
    }

    // Se reset for true, limpar histórico antes de processar
    // Isso garante que a IA não misture conversas anteriores
    if (reset === true) {
      testConversations.delete(userId);
      logger.debug(`Histórico de teste resetado para usuário ${userId} antes de processar mensagem`);
    }

    // Obter configuração do agente
    const agentConfig = await agentConfigModel.findByUserId(userId);
    if (!agentConfig) {
      const appError: AppError = new Error('Configuração do agente não encontrada');
      appError.statusCode = 404;
      throw appError;
    }

    // Buscar mídias obrigatórias se for nova interação (reset = true)
    let mandatoryMedias: any[] = [];
    if (reset === true) {
      try {
        mandatoryMedias = await mediaModel.findMandatoryMedias(userId);
        logger.info(`Encontradas ${mandatoryMedias.length} mídia(s) obrigatória(s) para chat de teste do usuário ${userId}`);
        
        // Formatar mídias para retorno (apenas informações necessárias)
        mandatoryMedias = mandatoryMedias.map(media => ({
          id: media.id,
          title: media.title,
          description: media.description,
          caption: media.caption || null,
          fileType: media.file_type,
          filename: media.filename,
        }));
      } catch (error: any) {
        logger.error(`Erro ao buscar mídias obrigatórias para chat de teste: ${error.message}`);
        // Continuar mesmo se houver erro ao buscar mídias
      }
    }

    // Obter histórico da conversa de teste (pode estar vazio se foi resetado)
    let conversationHistory = testConversations.get(userId) || [];

    // Adicionar mensagem do usuário ao histórico
    conversationHistory.push({ role: 'Cliente', content: message.trim() });

    // Limitar histórico a últimas 10 mensagens para não sobrecarregar
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    logger.info(`Processando mensagem de teste para usuário ${userId}: "${message.substring(0, 50)}..."`);

    // Gerar resposta usando RAG
    // Usar um ID de conversa fictício para teste (0)
    // Passar histórico customizado (últimas 10 mensagens para contexto)
    // Se reset foi true, o histórico estará vazio, então a IA começará do zero
    const response = await ragService.generateResponse(
      userId,
      0, // conversationId fictício
      message.trim(),
      conversationHistory.slice(-10) // Últimas 10 mensagens para contexto
    );

    // Adicionar resposta da IA ao histórico
    conversationHistory.push({ role: 'Agente', content: response });

    // Atualizar histórico
    testConversations.set(userId, conversationHistory);

    logger.info(`Resposta gerada para usuário ${userId}: "${response.substring(0, 50)}..."`);

    res.json({
      response,
      mandatoryMedias: mandatoryMedias.length > 0 ? mandatoryMedias : undefined,
    });
  } catch (error: any) {
    logger.error(`Erro ao processar mensagem de teste: ${error.message}`);
    
    // Sempre retornar uma resposta, mesmo em caso de erro
    const errorMessage = error.message || 'Erro desconhecido ao processar mensagem';
    
    // Se o erro for sobre modelo não encontrado, retornar mensagem específica
    if (errorMessage.includes('não encontrado no Ollama') || errorMessage.includes('404')) {
      res.status(400).json({
        error: 'Modelo não encontrado',
        message: 'O modelo configurado não está disponível no Ollama. Verifique as configurações e certifique-se de que o modelo está instalado.',
        details: errorMessage,
      });
      return;
    }
    
    // Se o erro for sobre modelo não suportar embeddings, retornar mensagem específica
    if (errorMessage.includes('não suporta embeddings')) {
      res.status(400).json({
        error: 'Modelo não suporta embeddings',
        message: 'O modelo configurado para embeddings não suporta essa funcionalidade. Configure um modelo que suporte embeddings.',
        details: errorMessage,
      });
      return;
    }
    
    // Outros erros
    res.status(500).json({
      error: 'Erro ao processar mensagem',
      message: errorMessage,
    });
  }
};

export const clearTestChat = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    // Limpar histórico de teste do usuário
    testConversations.delete(userId);

    logger.info(`Histórico de teste limpo para usuário ${userId}`);

    res.json({
      message: 'Histórico de teste limpo com sucesso',
    });
  } catch (error: any) {
    logger.error(`Erro ao limpar histórico de teste: ${error.message}`);
    throw error;
  }
};

/**
 * Obter informações sobre o log de curadoria
 */
export const getTestLogInfo = async (
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const logPath = TestChatLogger.getLogFilePath();

    res.json({
      logFilePath: logPath,
      message: 'As interações de teste são logadas automaticamente neste arquivo para curadoria',
    });
  } catch (error: any) {
    logger.error(`Erro ao obter info do log de teste: ${error.message}`);
    throw error;
  }
};

