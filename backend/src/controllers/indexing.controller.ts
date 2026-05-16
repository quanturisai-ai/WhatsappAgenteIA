import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { IndexingService } from '../services/indexing.service';
import logger from '../utils/logger';

const indexingService = new IndexingService();

/**
 * Listar todo o conteúdo indexável com status
 */
export const listIndexableContent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const contents = await indexingService.listIndexableContent(userId);

    res.json({
      contents,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Iniciar indexação de todos os conteúdos pendentes
 */
export const startIndexing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    // Processar em background (não bloquear a resposta)
    indexingService.indexAllPending(userId).catch((error) => {
      logger.error(`Erro ao indexar conteúdos em background: ${error.message}`);
    });

    res.json({
      message: 'Indexação iniciada em background',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Indexar conteúdo específico
 */
export const indexContent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { type, id } = req.params;

    if (!['agent_config', 'topic', 'document', 'media'].includes(type)) {
      const appError: AppError = new Error('Tipo de conteúdo inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const contentId = parseInt(id);
    if (isNaN(contentId)) {
      const appError: AppError = new Error('ID inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await indexingService.reindexContent(userId, type, contentId);

    res.json({
      message: 'Conteúdo indexado com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Obter status da indexação
 */
export const getIndexingStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const contents = await indexingService.listIndexableContent(userId);

    const stats = {
      total: contents.length,
      indexed: contents.filter(c => c.indexingStatus === 'indexed').length,
      pending: contents.filter(c => c.indexingStatus === 'pending').length,
      indexing: contents.filter(c => c.indexingStatus === 'indexing').length,
      error: contents.filter(c => c.indexingStatus === 'error').length,
    };

    res.json({
      stats,
      contents,
    });
  } catch (error: any) {
    next(error);
  }
};

