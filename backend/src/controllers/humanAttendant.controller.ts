import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { HumanAttendantService } from '../services/humanAttendant.service';
import { WhatsAppManager } from '../services/whatsapp.manager';
import logger from '../utils/logger';

const humanAttendantService = new HumanAttendantService();

export const getAttendants = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const attendants = await humanAttendantService.getAttendants(userId);

    // Mapear dados do banco (snake_case) para o formato esperado pelo frontend (camelCase)
    const formattedAttendants = attendants.map((attendant: any) => {
      // Converter is_active (0/1 do MySQL) para boolean
      let isActive = false;
      if (attendant.is_active !== undefined) {
        isActive = attendant.is_active === 1 || attendant.is_active === true;
      } else if (attendant.isActive !== undefined) {
        isActive = attendant.isActive === true;
      }

      return {
        id: attendant.id,
        phoneNumber: attendant.phone_number || attendant.phoneNumber || '',
        name: attendant.name || null,
        isActive,
        createdAt: attendant.created_at ? new Date(attendant.created_at).toISOString() : (attendant.createdAt || new Date().toISOString()),
        updatedAt: attendant.updated_at ? new Date(attendant.updated_at).toISOString() : (attendant.updatedAt || new Date().toISOString()),
      };
    });

    res.json({
      attendants: formattedAttendants,
    });
  } catch (error: any) {
    next(error);
  }
};

export const createAttendant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { phoneNumber, name, isActive } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      const appError: AppError = new Error('Número de telefone é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    const attendant = await humanAttendantService.createAttendant(
      userId,
      phoneNumber.trim(),
      name?.trim() || null,
      isActive
    );

    // Mapear dados do banco (snake_case) para o formato esperado pelo frontend (camelCase)
    // Converter is_active (0/1 do MySQL) para boolean
    let formattedIsActive = false;
    if (attendant.is_active !== undefined) {
      formattedIsActive = attendant.is_active === 1 || attendant.is_active === true;
    } else if (attendant.isActive !== undefined) {
      formattedIsActive = attendant.isActive === true;
    }

    const formattedAttendant = {
      id: attendant.id,
      phoneNumber: attendant.phone_number || attendant.phoneNumber || '',
      name: attendant.name || null,
      isActive: formattedIsActive,
      createdAt: attendant.created_at ? new Date(attendant.created_at).toISOString() : (attendant.createdAt || new Date().toISOString()),
      updatedAt: attendant.updated_at ? new Date(attendant.updated_at).toISOString() : (attendant.updatedAt || new Date().toISOString()),
    };

    res.json({
      message: 'Atendente criado com sucesso',
      attendant: formattedAttendant,
    });
  } catch (error: any) {
    next(error);
  }
};

export const updateAttendant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const attendantId = parseInt(id);

    if (isNaN(attendantId)) {
      const appError: AppError = new Error('ID de atendente inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const { phoneNumber, name, isActive } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      const appError: AppError = new Error('Número de telefone é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    const attendant = await humanAttendantService.updateAttendant(
      attendantId,
      userId,
      phoneNumber.trim(),
      name?.trim() || null,
      isActive
    );

    // Mapear dados do banco (snake_case) para o formato esperado pelo frontend (camelCase)
    // Converter is_active (0/1 do MySQL) para boolean
    let formattedIsActive = false;
    if (attendant.is_active !== undefined) {
      formattedIsActive = attendant.is_active === 1 || attendant.is_active === true;
    } else if (attendant.isActive !== undefined) {
      formattedIsActive = attendant.isActive === true;
    }

    const formattedAttendant = {
      id: attendant.id,
      phoneNumber: attendant.phone_number || attendant.phoneNumber || '',
      name: attendant.name || null,
      isActive: formattedIsActive,
      createdAt: attendant.created_at ? new Date(attendant.created_at).toISOString() : (attendant.createdAt || new Date().toISOString()),
      updatedAt: attendant.updated_at ? new Date(attendant.updated_at).toISOString() : (attendant.updatedAt || new Date().toISOString()),
    };

    res.json({
      message: 'Atendente atualizado com sucesso',
      attendant: formattedAttendant,
    });
  } catch (error: any) {
    next(error);
  }
};

export const deleteAttendant = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const attendantId = parseInt(id);

    if (isNaN(attendantId)) {
      const appError: AppError = new Error('ID de atendente inválido');
      appError.statusCode = 400;
      throw appError;
    }

    await humanAttendantService.deleteAttendant(attendantId, userId);

    res.json({
      message: 'Atendente deletado com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const sendTestMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { phoneNumber } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      const appError: AppError = new Error('Número de telefone é obrigatório');
      appError.statusCode = 400;
      throw appError;
    }

    // Obter serviço WhatsApp do usuário através do WhatsAppManager
    const whatsappManager = WhatsAppManager.getInstance();
    const whatsappService = whatsappManager.getServiceSync(userId);

    if (!whatsappService || !whatsappService.isReady()) {
      const appError: AppError = new Error('WhatsApp não está pronto');
      appError.statusCode = 400;
      throw appError;
    }
    
    await humanAttendantService.sendTestMessage(phoneNumber.trim(), whatsappService);

    res.json({
      message: 'Mensagem de teste enviada com sucesso',
    });
  } catch (error: any) {
    next(error);
  }
};

export const getAlertsByConversation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    const alerts = await humanAttendantService.getAlertsByConversation(conversationId);

    res.json({
      alerts,
    });
  } catch (error: any) {
    next(error);
  }
};

export const resolveIntervention = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const { id } = req.params;
    const conversationId = parseInt(id);

    if (isNaN(conversationId)) {
      const appError: AppError = new Error('ID de conversa inválido');
      appError.statusCode = 400;
      throw appError;
    }

    // Importar ConversationModel para atualizar a conversa
    const { ConversationModel } = await import('../models/conversation.model');
    const conversationModel = new ConversationModel();

    // Verificar se a conversa pertence ao usuário
    const conversation = await conversationModel.findById(conversationId);
    if (!conversation || conversation.user_id !== userId) {
      const appError: AppError = new Error('Conversa não encontrada ou não autorizada');
      appError.statusCode = 404;
      throw appError;
    }

    // Marcar intervenção como resolvida
    await conversationModel.update(conversationId, {
      needs_intervention: false,
      intervention_resolved_at: new Date(),
    });

    res.json({
      message: 'Intervenção marcada como resolvida',
    });
  } catch (error: any) {
    next(error);
  }
};

