import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { AgentConfigModel } from '../models/agentConfig.model';
import logger from '../utils/logger';
import { modeloPainelMode } from '../utils/agentFlags';
import { aceita, capacidades, ehTranscricao, garantirCatalogo, listarCatalogo, precoPorMilhao, catalogoCarregadoEm } from '../services/modelosOpenRouter';
import { lerModelosExtras, padraoGeracao, padraoTranscricao, padraoVisao, salvarModelosExtras } from '../services/modelosPainel';

const agentConfigModel = new AgentConfigModel();

/**
 * Etapa 6 (AGENTE_MODELO_PAINEL): modelos de foto/vídeo e de transcrição no painel, padrões do .env e
 * o catálogo do OpenRouter (o que cada modelo aceita e o preço). Flag off: a tela fica como antes.
 */
function painelDeModelosAtivo(): boolean {
  return modeloPainelMode() !== 'off';
}

async function extrasDoPainel(userId: number): Promise<Record<string, any>> {
  if (!painelDeModelosAtivo()) return {};
  const ex = await lerModelosExtras(userId);
  return {
    visionModel: ex.vision_model || '',
    transcriptionModel: ex.transcription_model || '',
    modelosPainel: { ativo: true, padroes: { geracao: padraoGeracao(), visao: padraoVisao(), transcricao: padraoTranscricao() } },
  };
}

/** Avisos do que cada modelo escolhido não faz (catálogo do OpenRouter). Nunca lança. */
async function avisosDosModelos(m: { geracao: string; visao: string; transcricao: string }): Promise<string[]> {
  const avisos: string[] = [];
  try {
    const g = m.geracao ? await capacidades(m.geracao) : null;
    if (g && !g.conhecido) avisos.push(`Modelo principal '${m.geracao}' não está no catálogo do OpenRouter.`);
    if (g?.conhecido) {
      if (g.tools === false) avisos.push(`'${m.geracao}' não usa ferramentas: o agente usa o modo antigo por marcador.`);
      const falta = (['image', 'video'] as const).filter((t) => aceita(g, t) === false);
      if (falta.length) avisos.push(`'${m.geracao}' não abre ${falta.map((t) => (t === 'image' ? 'foto' : 'vídeo')).join(' nem ')}: o modelo de foto/vídeo descreve antes.`);
    }
    const v = m.visao ? await capacidades(m.visao) : null;
    if (v?.conhecido) {
      const falta = (['image', 'video'] as const).filter((t) => aceita(v, t) === false && !(g && aceita(g, t) === true));
      if (falta.length) avisos.push(`Nenhum modelo escolhido abre ${falta.map((t) => (t === 'image' ? 'foto' : 'vídeo')).join(' nem ')}: essas mídias vão para o atendente.`);
    } else if (m.visao && v && !v.conhecido) avisos.push(`Modelo de foto/vídeo '${m.visao}' não está no catálogo do OpenRouter.`);
    const t = m.transcricao ? await capacidades(m.transcricao) : null;
    if (t?.conhecido && ehTranscricao(t) !== true && aceita(t, 'audio') !== true) avisos.push(`'${m.transcricao}' não aceita áudio: a transcrição vai falhar.`);
  } catch (err: any) {
    logger.warn(`[modelos] avisos indisponíveis: ${err?.message || err}`);
  }
  return avisos;
}

/** GET /api/agent-config/modelos: catálogo do OpenRouter (entrada, saída, tools, preço US$/milhão). */
export const listarModelosCatalogo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await garantirCatalogo({ esperaMs: 20000, forcar: String(req.query.atualizar || '') === '1' });
    const modelos = listarCatalogo()
      .map((c) => ({
        id: c.id,
        nome: c.nome || c.id,
        entrada: c.entrada,
        saida: c.saida,
        tools: c.tools,
        raciocinioObrigatorio: !!c.raciocinio?.obrigatorio,
        precoMilhao: precoPorMilhao(c),
        contexto: c.contexto ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    res.json({ modelos, carregadoEm: catalogoCarregadoEm() });
  } catch (error: any) {
    next(error);
  }
};

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
          embeddingModel: '',
          generationModel: '',
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          repeatPenalty: 1.1,
          maxAgeHours: 12,
          ...(await extrasDoPainel(userId)),
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
        embeddingModel: config.embedding_model || '',
        generationModel: config.generation_model || '',
        temperature: config.temperature ?? 0.7,
        topP: config.top_p ?? 0.9,
        topK: config.top_k ?? 40,
        repeatPenalty: config.repeat_penalty ?? 1.1,
        maxAgeHours: config.max_age_hours ?? 12,
        createdAt: config.created_at,
        updatedAt: config.updated_at,
        ...(await extrasDoPainel(userId)),
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
      visionModel,
      transcriptionModel,
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
      // Etapa 6 (regra do dono): sem modelo fixo. Não enviado = mantém o atual; vazio = padrão do .env.
      embedding_model: (embeddingModel !== undefined ? (String(embeddingModel || '').trim() || null) : (existing?.embedding_model ?? null)) as any,
      generation_model: (generationModel !== undefined ? (String(generationModel || '').trim() || null) : (existing?.generation_model ?? null)) as any,
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

    // Etapa 6: modelos de foto/vídeo e transcrição + catálogo atualizado ao salvar + avisos de capacidade.
    let avisos: string[] | undefined;
    if (painelDeModelosAtivo()) {
      const ok = await salvarModelosExtras(userId, { vision_model: visionModel, transcription_model: transcriptionModel });
      await garantirCatalogo({ esperaMs: 15000, forcar: true });
      const ex = await lerModelosExtras(userId);
      avisos = await avisosDosModelos({
        geracao: (config.generation_model || '').trim() || padraoGeracao(),
        visao: ex.vision_model || padraoVisao(),
        transcricao: ex.transcription_model || padraoTranscricao(),
      });
      if (!ok && (visionModel !== undefined || transcriptionModel !== undefined)) avisos.unshift('Modelos de foto/vídeo e transcrição não foram gravados (colunas novas ainda não criadas no banco).');
    }

    res.json({
      message: 'Configuração do agente atualizada com sucesso',
      ...(avisos ? { avisos } : {}),
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
        embeddingModel: config.embedding_model || '',
        generationModel: config.generation_model || '',
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

