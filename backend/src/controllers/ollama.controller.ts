import { Request, Response, NextFunction } from 'express';
import { OpenRouterService } from '../services/openrouter.service';
import logger from '../utils/logger';

const openRouterService = new OpenRouterService();

/**
 * Listar todos os modelos de geração disponíveis no OpenRouter
 */
export const listModels = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const models = await openRouterService.listModels();
    
    res.json({
      models: models.map(m => ({
        name: m.name,
        size: m.size,
        sizeFormatted: m.size > 0 ? `${(m.size / 1024 / 1024 / 1024).toFixed(2)} GB` : 'N/A',
        modifiedAt: m.modified_at,
      })),
    });
  } catch (error: any) {
    logger.error(`Erro ao listar modelos: ${error.message}`);
    next(error);
  }
};

/**
 * Verificar saúde do OpenRouter
 */
export const checkHealth = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const isHealthy = await openRouterService.checkHealth();
    
    res.json({
      healthy: isHealthy,
      provider: 'openrouter',
    });
  } catch (error: any) {
    logger.error(`Erro ao verificar saúde do OpenRouter: ${error.message}`);
    next(error);
  }
};
