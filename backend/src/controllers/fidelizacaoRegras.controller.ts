import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { FidelizacaoTipoGatilhoModel } from '../models/fidelizacaoTipoGatilho.model';
import { FidelizacaoRegraModel } from '../models/fidelizacaoRegra.model';
import { FidelizacaoRegrasConfigModel } from '../models/fidelizacaoRegrasConfig.model';
import { FidelizacaoRegrasService } from '../services/fidelizacaoRegras.service';

const tipoGatilhoModel = new FidelizacaoTipoGatilhoModel();
const regraModel = new FidelizacaoRegraModel();
const configModel = new FidelizacaoRegrasConfigModel();
const regrasService = new FidelizacaoRegrasService();

export const listarTiposGatilho = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tipos = await tipoGatilhoModel.findAll(true);
    res.json({ tipos });
  } catch (error: any) {
    next(error);
  }
};

export const getConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const config = await configModel.getOrCreateDefault(userId);
    res.json(config);
  } catch (error: any) {
    next(error);
  }
};

export const updateConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { ativo, max_mensagens_por_cliente_semana, max_mensagens_por_cliente_mes, simulacao } = req.body;
    const config = await configModel.upsert({
      user_id: userId,
      ativo: ativo === true || ativo === 'true',
      max_mensagens_por_cliente_semana: max_mensagens_por_cliente_semana ?? 2,
      max_mensagens_por_cliente_mes: max_mensagens_por_cliente_mes ?? 4,
      simulacao: simulacao === true || simulacao === 'true',
    });
    res.json(config);
  } catch (error: any) {
    next(error);
  }
};

export const listarRegras = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const regras = await regraModel.findByUserId(userId);
    res.json({ regras });
  } catch (error: any) {
    next(error);
  }
};

export const criarRegra = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const {
      tipo_gatilho_id,
      nome_regra,
      parametros,
      segmentacao,
      mensagem_template,
      frequencia_minima_dias,
      horario_inicio,
      horario_fim,
      vigencia_inicio,
      vigencia_fim,
      ativo,
    } = req.body;

    if (!tipo_gatilho_id || !nome_regra || !mensagem_template) {
      const appError: AppError = new Error('tipo_gatilho_id, nome_regra e mensagem_template são obrigatórios');
      (appError as AppError).statusCode = 400;
      throw appError;
    }

    const regra = await regraModel.create({
      user_id: userId,
      tipo_gatilho_id: Number(tipo_gatilho_id),
      nome_regra: String(nome_regra).trim(),
      parametros: parametros && typeof parametros === 'object' ? parametros : {},
      segmentacao: segmentacao && typeof segmentacao === 'object' ? segmentacao : null,
      mensagem_template: String(mensagem_template),
      frequencia_minima_dias: Number(frequencia_minima_dias) || 30,
      horario_inicio: horario_inicio || '08:00:00',
      horario_fim: horario_fim || '20:00:00',
      vigencia_inicio: vigencia_inicio ? new Date(vigencia_inicio) : new Date(),
      vigencia_fim: vigencia_fim ? new Date(vigencia_fim) : null,
      ativo: ativo !== false && ativo !== 'false',
    });
    res.status(201).json(regra);
  } catch (error: any) {
    next(error);
  }
};

export const getRegra = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      (appError as AppError).statusCode = 400;
      throw appError;
    }
    const regra = await regraModel.findById(id);
    if (!regra || regra.user_id !== userId) {
      const appError: AppError = new Error('Regra não encontrada');
      (appError as AppError).statusCode = 404;
      throw appError;
    }
    res.json(regra);
  } catch (error: any) {
    next(error);
  }
};

export const updateRegra = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      (appError as AppError).statusCode = 400;
      throw appError;
    }
    const regra = await regraModel.findById(id);
    if (!regra || regra.user_id !== userId) {
      const appError: AppError = new Error('Regra não encontrada');
      (appError as AppError).statusCode = 404;
      throw appError;
    }
    const {
      tipo_gatilho_id,
      nome_regra,
      parametros,
      segmentacao,
      mensagem_template,
      frequencia_minima_dias,
      horario_inicio,
      horario_fim,
      vigencia_inicio,
      vigencia_fim,
      ativo,
    } = req.body;

    const updates: any = {};
    if (tipo_gatilho_id !== undefined) updates.tipo_gatilho_id = Number(tipo_gatilho_id);
    if (nome_regra !== undefined) updates.nome_regra = String(nome_regra).trim();
    if (parametros !== undefined) updates.parametros = typeof parametros === 'object' ? parametros : regra.parametros;
    if (segmentacao !== undefined) updates.segmentacao = segmentacao && typeof segmentacao === 'object' ? segmentacao : null;
    if (mensagem_template !== undefined) updates.mensagem_template = String(mensagem_template);
    if (frequencia_minima_dias !== undefined) updates.frequencia_minima_dias = Number(frequencia_minima_dias) || 30;
    if (horario_inicio !== undefined) updates.horario_inicio = horario_inicio;
    if (horario_fim !== undefined) updates.horario_fim = horario_fim;
    if (vigencia_inicio !== undefined) updates.vigencia_inicio = new Date(vigencia_inicio);
    if (vigencia_fim !== undefined) updates.vigencia_fim = vigencia_fim ? new Date(vigencia_fim) : null;
    if (ativo !== undefined) updates.ativo = ativo !== false && ativo !== 'false';

    const updated = await regraModel.update(id, updates);
    res.json(updated);
  } catch (error: any) {
    next(error);
  }
};

export const deleteRegra = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      (appError as AppError).statusCode = 400;
      throw appError;
    }
    const regra = await regraModel.findById(id);
    if (!regra || regra.user_id !== userId) {
      const appError: AppError = new Error('Regra não encontrada');
      (appError as AppError).statusCode = 404;
      throw appError;
    }
    await regraModel.delete(id);
    res.status(204).send();
  } catch (error: any) {
    next(error);
  }
};

export const toggleRegra = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      (appError as AppError).statusCode = 400;
      throw appError;
    }
    const regra = await regraModel.findById(id);
    if (!regra || regra.user_id !== userId) {
      const appError: AppError = new Error('Regra não encontrada');
      (appError as AppError).statusCode = 404;
      throw appError;
    }
    const updated = await regraModel.update(id, { ativo: !regra.ativo });
    res.json(updated);
  } catch (error: any) {
    next(error);
  }
};

export const previewRegraById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      const appError: AppError = new Error('ID inválido');
      (appError as AppError).statusCode = 400;
      throw appError;
    }
    const regra = await regraModel.findById(id);
    if (!regra || regra.user_id !== userId) {
      const appError: AppError = new Error('Regra não encontrada');
      (appError as AppError).statusCode = 404;
      throw appError;
    }
    const result = await regrasService.previewRegra(userId, regra);
    res.json(result);
  } catch (error: any) {
    next(error);
  }
};

export const previewRegraByBody = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const body = req.body;
    const dados = {
      user_id: userId,
      tipo_gatilho_id: body.tipo_gatilho_id,
      nome_regra: body.nome_regra || 'Preview',
      parametros: body.parametros && typeof body.parametros === 'object' ? body.parametros : {},
      segmentacao: body.segmentacao && typeof body.segmentacao === 'object' ? body.segmentacao : null,
      mensagem_template: body.mensagem_template || '',
      frequencia_minima_dias: Number(body.frequencia_minima_dias) || 30,
      horario_inicio: body.horario_inicio || '08:00:00',
      horario_fim: body.horario_fim || '20:00:00',
      vigencia_inicio: body.vigencia_inicio ? new Date(body.vigencia_inicio) : new Date(),
      vigencia_fim: body.vigencia_fim ? new Date(body.vigencia_fim) : null,
      ativo: true,
    };
    const result = await regrasService.previewRegra(userId, dados as any);
    res.json(result);
  } catch (error: any) {
    next(error);
  }
};
