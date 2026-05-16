import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  // Log mais detalhado do erro
  const errorDetails: any = {
    message: String(err?.message || err || 'Erro desconhecido'),
    stack: String(err?.stack || 'N/A'),
    path: String(req?.path || 'N/A'),
    method: String(req?.method || 'N/A'),
  };
  
  // Adicionar body apenas se não for sensível
  try {
    if (req?.body && !req.body.password && !req.body.senha) {
      errorDetails.body = req.body;
    }
  } catch (e) {
    // Ignorar erro ao adicionar body
  }
  
  try {
    logger.error(JSON.stringify(errorDetails));
  } catch (e) {
    logger.error('Erro ao logar detalhes: ' + String(err?.message || 'Erro desconhecido'));
  }

  const response: any = {
    status,
    message: String(err?.message || 'Erro interno do servidor'),
  };
  
  if (process.env.NODE_ENV === 'development' && err?.stack) {
    response.stack = String(err.stack);
  }
  
  res.status(statusCode).json(response);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error: AppError = new Error(`Rota não encontrada: ${req.originalUrl}`);
  error.statusCode = 404;
  error.isOperational = true;
  next(error);
};

