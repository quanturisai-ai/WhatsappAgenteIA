import { Request, Response, NextFunction } from 'express';
import { AuthService, RegisterData, LoginCredentials } from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const authService = new AuthService();

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data: RegisterData = req.body;

    // Validação básica
    if (!data.username || !data.email || !data.password) {
      const error: AppError = new Error('Username, email e senha são obrigatórios');
      error.statusCode = 400;
      throw error;
    }

    if (data.password.length < 6) {
      const error: AppError = new Error('Senha deve ter no mínimo 6 caracteres');
      error.statusCode = 400;
      throw error;
    }

    const result = await authService.register(data);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const credentials: LoginCredentials = req.body;
    logger.debug(`Tentativa de login para usuário: ${credentials.username}`);

    // Validação básica
    if (!credentials.username || !credentials.password) {
      const error: AppError = new Error('Username e senha são obrigatórios');
      error.statusCode = 400;
      throw error;
    }

    const result = await authService.login(credentials);

    if (!result || !result.user || !result.token) {
      logger.error('Login retornou resultado inválido', { result });
      const error: AppError = new Error('Erro ao fazer login: resposta inválida');
      error.statusCode = 500;
      throw error;
    }

    logger.info(`Login bem-sucedido para usuário: ${credentials.username}`);
    res.json({
      message: 'Login realizado com sucesso',
      user: result.user,
      token: result.token,
    });
  } catch (error: any) {
    logger.error(`Erro no login: ${error.message}`, { 
      username: req.body?.username,
      error: error.stack 
    });
    
    if (error instanceof Error && error.message === 'Credenciais inválidas') {
      const appError: AppError = error;
      appError.statusCode = 401;
      next(appError);
      return;
    }
    next(error);
  }
};

export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // req.user é definido pelo middleware authenticateToken
    const authReq = req as any;
    res.json({
      user: authReq.user,
    });
  } catch (error) {
    next(error);
  }
};

