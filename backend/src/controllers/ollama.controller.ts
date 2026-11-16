import { Request, Response, NextFunction } from 'express';
import { OllamaService } from '../services/ollama.service';
import logger from '../utils/logger';

const ollamaService = new OllamaService();

/**
 * Listar todos os modelos disponíveis no Ollama
 */
export const listModels = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const models = await ollamaService.listModels();
    
    res.json({
      models: models.map(m => ({
        name: m.name,
        size: m.size,
        sizeFormatted: `${(m.size / 1024 / 1024 / 1024).toFixed(2)} GB`,
        modifiedAt: m.modified_at,
      })),
    });
  } catch (error: any) {
    logger.error(`Erro ao listar modelos: ${error.message}`);
    next(error);
  }
};

/**
 * Verificar saúde do Ollama
 */
export const checkHealth = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const isHealthy = await ollamaService.checkHealth();
    
    res.json({
      healthy: isHealthy,
    });
  } catch (error: any) {
    logger.error(`Erro ao verificar saúde do Ollama: ${error.message}`);
    next(error);
  }
};

