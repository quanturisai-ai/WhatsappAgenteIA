import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { DocumentService } from '../services/document.service';
import logger from '../utils/logger';

const documentService = new DocumentService();

export const uploadDocument = async (
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

    const filePath = req.file.path;
    const filename = req.file.originalname;
    const fileType = req.file.mimetype.includes('pdf')
      ? '.pdf'
      : req.file.mimetype.includes('word')
      ? '.docx'
      : '.txt';

    // Processar documento em background
    documentService
      .processDocument(userId, filePath, filename, fileType)
      .then((result) => {
        logger.info(`Documento processado: ${filename} (ID: ${result.documentId})`);
      })
      .catch((error) => {
        logger.error(`Erro ao processar documento: ${error.message}`);
      });

    res.json({
      message: 'Documento enviado e está sendo processado',
      filename,
    });
  } catch (error: any) {
    next(error);
  }
};

export const listDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const documents = await documentService.listDocuments(userId);

    res.json({
      documents,
    });
  } catch (error: any) {
    next(error);
  }
};

export const deleteDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const documentId = parseInt(id);

    if (isNaN(documentId)) {
      const appError: AppError = new Error('ID de documento inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await documentService.deleteDocument(userId, documentId);

    res.json({
      message: 'Documento deletado com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const getUploadMiddleware = () => {
  return documentService.getUploadMiddleware().single('document');
};

