import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { AgentConfigModel } from '../models/agentConfig.model';
import logger from '../utils/logger';

const agentConfigModel = new AgentConfigModel();

export const getAgentConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const config = await agentConfigModel.findByUserId(userId);

    if (!config) {
      // Retornar configuração vazia se não existir
      res.json({
        config: {
          businessName: '',
          businessInfo: '',
          services: '',
          hours: '',
          personality: '',
          greetingMessage: '',
          farewellMessage: '',
          absenceMessage: '',
          specificInstructions: '',
          embeddingModel: 'deepseek-r1',
          generationModel: 'deepseek-r1',
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1,
          maxAgeHours: 12,
        },
      });
      return;
    }

    res.json({
      config: {
        id: config.id,
        businessName: config.business_name || '',
        businessInfo: config.business_info || '',
        services: config.services || '',
        hours: config.hours || '',
        personality: config.personality || '',
        greetingMessage: config.greeting_message || '',
        farewellMessage: config.farewell_message || '',
        absenceMessage: config.absence_message || '',
        specificInstructions: config.specific_instructions || '',
        embeddingModel: config.embedding_model || 'deepseek-r1',
        generationModel: config.generation_model || 'deepseek-r1',
        temperature: config.temperature ?? 0.7,
        topP: config.top_p ?? 0.9,
        topK: config.top_k ?? 40,
        repeatPenalty: config.repeat_penalty ?? 1.1,
        maxAgeHours: config.max_age_hours ?? 12,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      },
    });
  } catch (error: any) {
    next(error);
  }
};

export const updateAgentConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    const {
      businessName,
      businessInfo,
      services,
      hours,
      personality,
      greetingMessage,
      farewellMessage,
      absenceMessage,
      specificInstructions,
      embeddingModel,
      generationModel,
      temperature,
      topP,
      topK,
      repeatPenalty,
      maxAgeHours,
    } = req.body;

    // Verificar se configuração existe
    const existing = await agentConfigModel.findByUserId(userId);

    const configData = {
      user_id: userId,
      business_name: businessName || null,
      business_info: businessInfo || null,
      services: services || null,
      hours: hours || null,
      personality: personality || null,
      greeting_message: greetingMessage || null,
      farewell_message: farewellMessage || null,
      absence_message: absenceMessage || null,
      specific_instructions: specificInstructions || null,
      embedding_model: embeddingModel || 'deepseek-r1',
      generation_model: generationModel || 'deepseek-r1',
      temperature: temperature !== undefined ? temperature : (existing?.temperature ?? 0.7),
      top_p: topP !== undefined ? topP : (existing?.top_p ?? 0.9),
      top_k: topK !== undefined ? topK : (existing?.top_k ?? 40),
      repeat_penalty: repeatPenalty !== undefined ? repeatPenalty : (existing?.repeat_penalty ?? 1.1),
      max_age_hours: maxAgeHours !== undefined ? maxAgeHours : (existing?.max_age_hours ?? 12),
    };

    let config;

    if (existing) {
      // Atualizar configuração existente
      config = await agentConfigModel.update(userId, configData);
    } else {
      // Criar nova configuração
      config = await agentConfigModel.create(configData);
    }

    if (!config) {
      const appError: AppError = new Error('Erro ao salvar configuração');
      appError.statusCode = 500;
      throw appError;
    }

    logger.info(`Configuração do agente atualizada para usuário ${userId}`);

    res.json({
      message: 'Configuração do agente atualizada com sucesso',
      config: {
        id: config.id,
        businessName: config.business_name || '',
        businessInfo: config.business_info || '',
        services: config.services || '',
        hours: config.hours || '',
        personality: config.personality || '',
        greetingMessage: config.greeting_message || '',
        farewellMessage: config.farewell_message || '',
        absenceMessage: config.absence_message || '',
        specificInstructions: config.specific_instructions || '',
        embeddingModel: config.embedding_model || 'deepseek-r1',
        generationModel: config.generation_model || 'deepseek-r1',
        temperature: config.temperature ?? 0.7,
        topP: config.top_p ?? 0.9,
        topK: config.top_k ?? 40,
        repeatPenalty: config.repeat_penalty ?? 1.1,
        maxAgeHours: config.max_age_hours ?? 12,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
      },
    });
  } catch (error: any) {
    next(error);
  }
};

