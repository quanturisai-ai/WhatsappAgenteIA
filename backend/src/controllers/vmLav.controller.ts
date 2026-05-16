import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { VmLavService } from '../services/vmLav.service';
import logger from '../utils/logger';

const vmLavService = new VmLavService();

/**
 * Configurar credenciais VM Lav
 */
export const configurarCredenciais = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    logger.info(`[VM Lav] Recebendo requisição para configurar credenciais - UserId: ${userId}`);
    logger.debug(`[VM Lav] Body recebido: ${JSON.stringify({ email: req.body.email ? '***' : 'undefined', senha: req.body.senha ? '***' : 'undefined' })}`);

    const { email, senha } = req.body;

    if (!email) {
      logger.warn(`[VM Lav] Validação falhou - Email: ${email ? 'presente' : 'ausente'}`);
      const appError: AppError = new Error('Email é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }
    
    // Verificar se há credenciais existentes
    const credentials = await vmLavService.obterCredenciais(userId);
    
    // Se não há credenciais existentes, a senha é obrigatória
    if (!credentials && (!senha || senha.trim() === '')) {
      logger.warn(`[VM Lav] Validação falhou - Senha ausente e não há credenciais existentes`);
      const appError: AppError = new Error('Senha é obrigatória para criar novas credenciais');
      appError.statusCode = 400;
      throw appError;
    }
    
    // Se há credenciais existentes mas senha está vazia, permitir (manterá senha atual)
    // Se senha foi fornecida, usar a nova senha

    // Callback para notificar quando CAPTCHA estiver pronto
    let captchaReady = false;
    const onCaptchaReady = () => {
      captchaReady = true;
      logger.info('[VM Lav] CAPTCHA pronto para resolução');
    };

    logger.info(`[VM Lav] Iniciando configuração de credenciais para usuário ${userId}`);
    
    let resultado: any;
    try {
      resultado = await vmLavService.configurarCredenciais(
        userId,
        email,
        senha,
        onCaptchaReady
      );
    } catch (serviceError: any) {
      logger.error(`[VM Lav] Erro ao chamar service: ${serviceError.message}`);
      logger.error(`[VM Lav] Stack do service: ${serviceError.stack}`);
      const appError: AppError = new Error(`Erro no service: ${serviceError.message}`);
      appError.statusCode = 500;
      throw appError;
    }

    // Validar resultado antes de usar
    if (resultado === null || resultado === undefined) {
      logger.error(`[VM Lav] Resultado é null ou undefined`);
      const appError: AppError = new Error('Erro inesperado ao configurar credenciais: resultado vazio');
      appError.statusCode = 500;
      throw appError;
    }

    if (typeof resultado !== 'object') {
      logger.error(`[VM Lav] Resultado não é um objeto: ${typeof resultado}, valor: ${String(resultado)}`);
      const appError: AppError = new Error('Erro inesperado ao configurar credenciais: resultado inválido');
      appError.statusCode = 500;
      throw appError;
    }

    // Extrair valores de forma segura
    let resultadoSuccess = false;
    let resultadoMessage = 'N/A';
    let resultadoCredentialsId: number | undefined = undefined;
    
    try {
      resultadoSuccess = Boolean((resultado as any)?.success);
      resultadoMessage = String((resultado as any)?.message || 'N/A');
      resultadoCredentialsId = (resultado as any)?.credentialsId;
    } catch (extractError: any) {
      logger.error('[VM Lav] Erro ao extrair valores do resultado: ' + String(extractError?.message || 'Erro desconhecido'));
      resultadoSuccess = false;
      resultadoMessage = 'Erro ao processar resultado';
    }
    
    logger.info('[VM Lav] Resultado da configuração: success=' + String(resultadoSuccess) + ', message=' + String(resultadoMessage));

    if (!resultadoSuccess) {
      let errorMessage = 'Erro ao configurar credenciais';
      try {
        const msg = (resultado as any)?.message;
        if (msg !== null && msg !== undefined) {
          if (typeof msg === 'string') {
            errorMessage = msg;
          } else if (typeof msg === 'object') {
            errorMessage = JSON.stringify(msg);
          } else {
            errorMessage = String(msg);
          }
        }
      } catch (e) {
        errorMessage = 'Erro ao configurar credenciais';
      }
      
      logger.error('[VM Lav] Falha na configuração: ' + String(errorMessage));
      
      const appError: AppError = new Error(String(errorMessage));
      appError.statusCode = 400;
      throw appError;
    }

    let responseMessage = 'Credenciais configuradas com sucesso';
    try {
      const msg = (resultado as any)?.message;
      if (msg && typeof msg === 'string') {
        responseMessage = msg;
      }
    } catch (e) {
      // Usar mensagem padrão
    }
    
    res.status(201).json({
      message: responseMessage,
      credentialsId: resultadoCredentialsId,
      captchaReady,
    });
  } catch (error: any) {
    const errorMsg = error?.message || 'Erro desconhecido';
    const errorStack = error?.stack || 'N/A';
    logger.error('[VM Lav] Erro no controller: ' + String(errorMsg));
    logger.error('[VM Lav] Stack: ' + String(errorStack));
    next(error);
  }
};

/**
 * Obter credenciais VM Lav do usuário
 */
export const obterCredenciais = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const credentials = await vmLavService.obterCredenciais(userId);

    if (!credentials) {
      res.json({
        credentials: null,
        message: 'Nenhuma credencial configurada',
      });
      return;
    }

    // Retornar senha em texto plano (não está mais criptografada)
    res.json({
      credentials: credentials,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Testar conexão VM Lav
 */
export const testarConexao = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const resultado = await vmLavService.sincronizarClientes(userId);

    if (!resultado.success) {
      const appError: AppError = new Error(resultado.message);
      appError.statusCode = 400;
      throw appError;
    }

    res.json({
      message: resultado.message,
      total: resultado.total,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Sincronizar clientes
 */
export const sincronizarClientes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const resultado = await vmLavService.sincronizarClientes(userId);

    if (!resultado.success) {
      const appError: AppError = new Error(resultado.message);
      appError.statusCode = 400;
      throw appError;
    }

    res.json({
      message: resultado.message,
      total: resultado.total,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Listar clientes
 */
export const listarClientes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { page = '1', limit = '50', search, orderBy, orderDir } = req.query;

    const resultado = await vmLavService.listarClientes(userId, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string | undefined,
      orderBy: orderBy as string | undefined,
      orderDir: (orderDir as 'ASC' | 'DESC') || 'ASC',
    });

    res.json({
      clientes: resultado.clientes,
      total: resultado.total,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Fechar navegador Puppeteer (após configuração)
 */
export const fecharNavegador = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await vmLavService.fecharNavegador();
    res.json({
      message: 'Navegador fechado',
    });
  } catch (error: any) {
    next(error);
  }
};

