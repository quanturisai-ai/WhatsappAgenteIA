import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { TopicService } from '../services/topic.service';

const topicService = new TopicService();

export const listTopics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { activeOnly } = req.query;
    
    let topics;
    if (activeOnly === 'true') {
      topics = await topicService.listActiveTopics(userId);
    } else {
      topics = await topicService.listTopics(userId);
    }

    res.json({
      topics,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const topicId = parseInt(id);

    if (isNaN(topicId)) {
      const appError: AppError = new Error('ID de tópico inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const topic = await topicService.getTopicById(topicId, userId);

    if (!topic) {
      const appError: AppError = new Error('Tópico não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    res.json({
      topic,
    });
  } catch (error: any) {
    next(error);
  }
};

export const createTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { title, description, triggerKeywords, context, priority, isActive } = req.body;

    if (!title || !description) {
      const appError: AppError = new Error('Título e descrição são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    // Garantir que triggerKeywords seja sempre um array (mesmo que vazio)
    const keywordsArray = Array.isArray(triggerKeywords) ? triggerKeywords : (triggerKeywords ? [triggerKeywords] : []);

    const topic = await topicService.createTopic(
      userId,
      title,
      description,
      keywordsArray,
      context || 'custom',
      priority || 0,
      isActive !== undefined ? isActive : true
    );

    res.status(201).json({
      message: 'Tópico criado com sucesso',
      topic,
    });
  } catch (error: any) {
    next(error);
  }
};

export const updateTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const topicId = parseInt(id);

    if (isNaN(topicId)) {
      const appError: AppError = new Error('ID de tópico inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const { title, description, triggerKeywords, context, priority, isActive } = req.body;

    // Garantir que triggerKeywords seja sempre um array (mesmo que vazio)
    const keywordsArray = Array.isArray(triggerKeywords) ? triggerKeywords : (triggerKeywords ? [triggerKeywords] : []);

    const topic = await topicService.updateTopic(topicId, userId, {
      title,
      description,
      triggerKeywords: keywordsArray,
      context,
      priority,
      isActive,
    });

    res.json({
      message: 'Tópico atualizado com sucesso',
      topic,
    });
  } catch (error: any) {
    next(error);
  }
};

export const deleteTopic = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const topicId = parseInt(id);

    if (isNaN(topicId)) {
      const appError: AppError = new Error('ID de tópico inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await topicService.deleteTopic(topicId, userId);

    res.json({
      message: 'Tópico deletado com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

