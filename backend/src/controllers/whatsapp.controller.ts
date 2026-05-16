import { Request, Response, NextFunction } from 'express';
import { WhatsAppManager } from '../services/whatsapp.manager';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const whatsappManager = WhatsAppManager.getInstance();

export const initializeWhatsApp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const service = await whatsappManager.initializeService(userId);

    // Configurar eventos para Socket.IO
    service.on('qr', (_qr) => {
      // QR Code será emitido via Socket.IO
      logger.debug('QR Code gerado');
    });

    service.on('ready', () => {
      logger.info(`WhatsApp pronto para usuário ${userId}`);
    });

    res.json({
      message: 'WhatsApp inicializado com sucesso',
      status: await service.getStatus(),
    });
  } catch (error: any) {
    logger.error(`Erro ao inicializar WhatsApp: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    
    // Fornecer mensagem mais útil para o frontend
    if (error.message.includes('Failed to launch') || error.message.includes('browser process')) {
      const appError: AppError = new Error(
        'Erro ao iniciar o navegador. Verifique se o Google Chrome está instalado ou se o Puppeteer baixou o Chromium corretamente. ' +
        'Execute: npx puppeteer browsers install chrome no diretório backend'
      );
      appError.statusCode = 500;
      next(appError);
      return;
    }
    
    // Capturar outros tipos de erro e fornecer mensagem mais útil
    const appError: AppError = new Error(
      `Erro ao inicializar WhatsApp: ${error.message || 'Erro desconhecido'}`
    );
    appError.statusCode = 500;
    next(appError);
  }
};

export const getWhatsAppStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const service = whatsappManager.getServiceSync(userId);
    
    if (!service) {
      res.json({
        status: 'disconnected',
        qrCode: null,
        isReady: false,
      });
      return;
    }

    const status = await service.getStatus();
    let qrCode = await service.getQRCode();

    // Garantir que qrCode seja null se for string "null" ou vazio
    if (qrCode === 'null' || qrCode === '' || (typeof qrCode === 'string' && qrCode.trim() === '')) {
      qrCode = null;
    }

    logger.debug(`Status retornado para usuário ${userId}: status=${status}, qrCode=${qrCode ? 'presente' : 'null'}, isReady=${service.isReady()}`);

    res.json({
      status,
      qrCode: qrCode || null, // Garantir que seja null e não string "null"
      isReady: service.isReady(),
    });
  } catch (error: any) {
    next(error);
  }
};

export const getQRCode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const service = whatsappManager.getServiceSync(userId);
    
    if (!service) {
      const appError: AppError = new Error('WhatsApp não inicializado');
      appError.statusCode = 404;
      throw appError;
    }

    const qrCode = await service.getQRCode();

    if (!qrCode) {
      const appError: AppError = new Error('QR Code não disponível');
      appError.statusCode = 404;
      throw appError;
    }

    res.json({ qrCode });
  } catch (error: any) {
    next(error);
  }
};

export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { contactNumber, content } = req.body;

    if (!contactNumber || !content) {
      const appError: AppError = new Error('Número de contato e conteúdo são obrigatórios');
      appError.statusCode = 400;
      throw appError;
    }

    const service = whatsappManager.getServiceSync(userId);
    
    if (!service || !service.isReady()) {
      const appError: AppError = new Error('WhatsApp não está pronto');
      appError.statusCode = 400;
      throw appError;
    }

    const message = await service.sendMessage(contactNumber, content);

    res.json({
      message: 'Mensagem enviada com sucesso',
      messageId: message.id._serialized,
    });
  } catch (error: any) {
    next(error);
  }
};

export const disconnectWhatsApp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    await whatsappManager.disconnectService(userId);

    res.json({
      message: 'WhatsApp desconectado com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const logoutWhatsApp = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    await whatsappManager.logoutService(userId);

    res.json({
      message: 'Logout realizado com sucesso',
    });
  } catch (error: any) {
    // Logar erro mas retornar sucesso parcial - logout pode ter problemas com arquivos em uso
    logger.error(`Erro durante logout: ${error.message}`);
    res.json({
      message: 'Logout realizado (alguns arquivos podem estar em uso)',
      warning: process.platform === 'win32' ? 'No Windows, alguns arquivos de sessão podem permanecer em uso' : undefined,
    });
  }
};

