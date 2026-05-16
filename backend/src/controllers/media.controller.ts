import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { MediaService } from '../services/media.service';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

const mediaService = new MediaService();

export const uploadMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    if (!req.file) {
      const appError: AppError = new Error('Arquivo não fornecido');
      appError.statusCode = 400;
      throw appError;
    }

    const { title, description } = req.body;

    if (!title || !description) {
      const appError: AppError = new Error('Título e descrição são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    const filePath = req.file.path;
    const filename = req.file.originalname;

    // Processar mídia em background
    mediaService
      .processMedia(userId, filePath, filename, title, description)
      .then((result) => {
        logger.info(`Mídia processada: ${filename} (ID: ${result.mediaId})`);
      })
      .catch((error) => {
        logger.error(`Erro ao processar mídia: ${error.message}`);
      });

    res.json({
      message: 'Mídia enviada e está sendo processada',
      filename,
    });
  } catch (error: any) {
    next(error);
  }
};

export const listMedias = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const medias = await mediaService.listMedias(userId);

    res.json({
      medias,
    });
  } catch (error: any) {
    next(error);
  }
};

export const updateMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const mediaId = parseInt(id);

    if (isNaN(mediaId)) {
      const appError: AppError = new Error('ID de mídia inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const { title, description, caption, isActive, mandatorySend } = req.body;

    if (!title || !description) {
      const appError: AppError = new Error('Título e descrição são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    const updatedMedia = await mediaService.updateMedia(userId, mediaId, title, description, caption, isActive, mandatorySend);

    res.json({
      message: 'Mídia atualizada com sucesso',
      media: updatedMedia,
    });
  } catch (error: any) {
    next(error);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const mediaId = parseInt(id);

    if (isNaN(mediaId)) {
      const appError: AppError = new Error('ID de mídia inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await mediaService.deleteMedia(userId, mediaId);

    res.json({
      message: 'Mídia deletada com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const getMediaFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const mediaId = parseInt(id);

    if (isNaN(mediaId)) {
      const appError: AppError = new Error('ID de mídia inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const media = await mediaService.getMediaById(mediaId);

    if (!media) {
      const appError: AppError = new Error('Mídia não encontrada');
      appError.statusCode = 404;
      throw appError;
    }

    // Verificar se a mídia pertence ao usuário
    if (media.user_id !== userId) {
      const appError: AppError = new Error('Não autorizado a acessar esta mídia');
      appError.statusCode = 403;
      throw appError;
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(media.file_path)) {
      const appError: AppError = new Error('Arquivo não encontrado');
      appError.statusCode = 404;
      throw appError;
    }

    // Enviar arquivo
    const filePath = path.resolve(media.file_path);
    res.sendFile(filePath);
  } catch (error: any) {
    next(error);
  }
};

export const getUploadMiddleware = () => {
  return mediaService.getUploadMiddleware().single('media');
};

