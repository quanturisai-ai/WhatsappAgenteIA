import axios, { AxiosInstance } from 'axios';
import { recordLlmCall, usageFields } from '../utils/turnMetrics';
import { envInt, openrouterPayloadV2, openrouterProviderConfig, openrouterProviderMode, turnMetricsEnabled } from '../utils/agentFlags';
import { currentTurn } from '../utils/turnMetrics';
import logger from '../utils/logger';
import { currentTurnControl, isTurnAbort } from '../utils/turnControl';
import { semBase64 } from '../utils/semBase64';

/** Item 2: chamada dentro de um turno do agendador leva o sinal de cancelamento (mensagem nova). */
function requestOptions(): [] | [{ signal: AbortSignal }] {
  const ctl = currentTurnControl();
  return ctl ? [{ signal: ctl.signal }] : [];
}

export class OpenRouterService {
  private baseUrl: string;
  private apiKey: string;
  private defaultEmbeddingModel: string;
  private defaultGenerationModel: string;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.defaultEmbeddingModel =
      process.env.OPENROUTER_EMBEDDING_MODEL || 'thenlper/gte-base';
    this.defaultGenerationModel =
      process.env.OPENROUTER_GENERATION_MODEL || 'deepseek/deepseek-v4-flash';

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.local',
        'X-Title': 'AgenteZap',
      },
      timeout: 120000,
    });

    logger.info('OpenRouterService inicializado:');
    logger.info(`  - Base URL: ${this.baseUrl}`);
    logger.info(`  - Modelo de embedding padrão: ${this.defaultEmbeddingModel}`);
    logger.info(`  - Modelo de geração padrão: ${this.defaultGenerationModel}`);
  }

  /**
   * Gerar embedding para um texto usando a API de embeddings do OpenRouter
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const embeddingModel = model || this.defaultEmbeddingModel;
    const tEmb = Date.now();
    try {
      logger.debug(`Gerando embedding com modelo: ${embeddingModel}`);

      let response: any;
      try {
        response = await this.axiosInstance.post('/embeddings', {
          model: embeddingModel,
          input: text,
        }, ...requestOptions());
      } catch (postError) {
        recordLlmCall({ kind: 'embedding', model: embeddingModel, ms: Date.now() - tEmb, ok: false });
        throw postError;
      }
      recordLlmCall({
        kind: 'embedding',
        model: response.data?.model || embeddingModel,
        provider: response.data?.provider ?? null,
        ms: Date.now() - tEmb,
        ok: true,
        ...usageFields(response.data?.usage),
      });

      const data = response.data?.data;
      if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0].embedding)) {
        return data[0].embedding;
      }

      throw new Error('Resposta do OpenRouter não contém embedding válido');
    } catch (error: any) {
      logger.error(
        `Erro ao gerar embedding com modelo '${embeddingModel}': ${error.message}`,
      );
      if (error.response) {
        logger.error(
          `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}`,
        );
        if (error.response.status === 404) {
          throw new Error(
            `Modelo de embedding '${embeddingModel}' não encontrado no OpenRouter.`,
          );
        }
      }
      throw new Error(`Erro ao gerar embedding: ${error.message}`);
    }
  }

  /**
   * Gerar embeddings para múltiplos textos
   */
  async generateEmbeddings(texts: string[], model?: string): Promise<number[][]> {
    const embeddingModel = model || this.defaultEmbeddingModel;
    try {
      logger.debug(
        `Gerando ${texts.length} embeddings em lote com modelo: ${embeddingModel}`,
      );

      // OpenRouter aceita array de strings no campo input
      const response = await this.axiosInstance.post('/embeddings', {
        model: embeddingModel,
        input: texts,
      });

      const data = response.data?.data;
      if (Array.isArray(data) && data.length > 0) {
        // A API retorna os embeddings na mesma ordem do input
        return data.map((item: any) => item.embedding as number[]);
      }

      throw new Error('Resposta do OpenRouter não contém embeddings válidos');
    } catch (error: any) {
      logger.error(`Erro ao gerar embeddings em lote: ${error.message}`);
      // Fallback: gerar um a um se a requisição em lote falhar
      if (error.response?.status === 422 || error.response?.status === 400) {
        logger.warn('Fallback para geração individual de embeddings');
        const embeddings: number[][] = [];
        for (const text of texts) {
          const embedding = await this.generateEmbedding(text, model);
          embeddings.push(embedding);
        }
        return embeddings;
      }
      throw error;
    }
  }

  /**
   * Verificar se o OpenRouter está disponível
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/models?output_modalities=text');
      return response.status === 200;
    } catch (error: any) {
      logger.error(`OpenRouter não está disponível: ${error.message}`);
      return false;
    }
  }

  /**
   * Verificar se um modelo está disponível
   */
  async checkModel(model?: string): Promise<boolean> {
    try {
      const modelToCheck = model || this.defaultGenerationModel;
      const response = await this.axiosInstance.get('/models?output_modalities=text');
      const models: any[] = response.data?.data || [];
      return models.some((m: any) => m.id === modelToCheck);
    } catch (error: any) {
      logger.error(`Erro ao verificar modelo: ${error.message}`);
      return false;
    }
  }

  /**
   * Listar modelos de geração disponíveis no OpenRouter
   */
  async listModels(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
    try {
      const response = await this.axiosInstance.get('/models?output_modalities=text');
      const models: any[] = response.data?.data || [];
      return models.map((m: any) => ({
        name: m.id,
        size: 0,
        modified_at: m.created ? new Date(m.created * 1000).toISOString() : '',
      }));
    } catch (error: any) {
      logger.error(`Erro ao listar modelos: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gerar resposta usando o modelo de linguagem via OpenRouter
   * Utiliza a API de chat completions (formato OpenAI-compatível).
   * Para o deepseek-v4-flash, envia reasoning.effort=none para desativar o thinking.
   */
  async generateResponse(
    prompt: string | Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }>,
    context?: string,
    model?: string,
    options?: {
      temperature?: number;
      top_p?: number;
      top_k?: number;
      repeat_penalty?: number;
    },
    extra?: { sessionId?: string; agenteYaml?: boolean; dataCollection?: 'deny' | 'allow'; temMidia?: boolean },
  ): Promise<string> {
    const generationModel = model || this.defaultGenerationModel;
    try {
      // Item 3: lista de mensagens (system + histórico user/assistant + atual) vai como está.
      const messages = Array.isArray(prompt)
        ? prompt.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: 'user', content: context ? `Contexto: ${context}\n\nPergunta: ${prompt}\n\nResposta:` : prompt }];

      const v2 = openrouterPayloadV2(extra?.agenteYaml === true);
      const body: any = v2
        ? buildPayloadV2(generationModel, messages, options, extra)
        : buildPayloadV1(generationModel, messages, options);
      // Item 5 (AGENTE_MULTIMODAL): política de privacidade no roteamento (só no caminho multimodal).
      if (extra?.dataCollection) body.provider = { ...(body.provider || {}), data_collection: extra.dataCollection };
      const ctxTurn = currentTurn();
      if (ctxTurn) {
        ctxTurn.meta.payload = v2 ? 'v2' : 'v1';
        ctxTurn.meta.provider_mode = v2 ? openrouterProviderMode() : 'sort';
      }

      logger.debug(
        `Gerando resposta com modelo: ${generationModel}, options: ${JSON.stringify(options || {})}`,
      );
      // Item 5: foto/vídeo do cliente nunca vai para o log (data URL vira "<N bytes>").
      logger.debug(`[OpenRouter] Payload: ${JSON.stringify(extra?.temMidia ? semBase64(body) : body)}`);

      const t0 = Date.now();
      let response: any;
      try {
        if (!extra?.temMidia) {
          response = await this.axiosInstance.post('/chat/completions', body, ...requestOptions());
        } else {
          const opts = { maxBodyLength: Infinity, ...(requestOptions()[0] || {}) };
          try {
            response = await this.axiosInstance.post('/chat/completions', body, opts);
          } catch (firstError: any) {
            // Item 5: com mídia, o Google às vezes devolve 429 (limite do fornecedor); 1 nova tentativa.
            if (isTurnAbort(firstError) || firstError?.response?.status !== 429) throw firstError;
            logger.warn('[OpenRouter] 429 com mídia; nova tentativa em 1,5 s');
            await new Promise((r) => setTimeout(r, 1500));
            if (currentTurnControl()?.signal.aborted) throw firstError;
            response = await this.axiosInstance.post('/chat/completions', body, opts);
          }
        }
      } catch (postError) {
        recordLlmCall({ kind: 'chat', model: generationModel, ms: Date.now() - t0, ok: false });
        throw postError;
      }
      const elapsed = Date.now() - t0;
      logger.debug(`[OpenRouter] Resposta recebida em ${elapsed}ms`);

      const content = response.data?.choices?.[0]?.message?.content;
      recordLlmCall({
        kind: 'chat',
        model: response.data?.model || generationModel,
        provider: response.data?.provider ?? null,
        ms: elapsed,
        ok: typeof content === 'string' && content.length > 0,
        ...usageFields(response.data?.usage),
      });
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }

      throw new Error('Resposta do OpenRouter não contém texto');
    } catch (error: any) {
      if (isTurnAbort(error)) throw error; // item 2: cancelado por mensagem nova, não é falha
      logger.error(
        `Erro ao gerar resposta com modelo '${generationModel}': ${error.message}`,
      );
      if (error.response) {
        logger.error(
          `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}`,
        );
        if (error.response.status === 404) {
          throw new Error(
            `Modelo '${generationModel}' não encontrado no OpenRouter.`,
          );
        }
      }
      throw new Error(`Erro ao gerar resposta: ${error.message}`);
    }
  }

  /**
   * Gerar resumo de texto
   */
  async generateSummary(
    text: string,
    maxLength: number = 500,
    model?: string,
  ): Promise<string> {
    try {
      const prompt = `Resuma o seguinte texto em no máximo ${maxLength} caracteres, mantendo as informações mais importantes:\n\n${text}`;
      const response = await this.generateResponse(prompt, undefined, model);
      return response.substring(0, maxLength);
    } catch (error: any) {
      logger.error(`Erro ao gerar resumo: ${error.message}`);
      throw error;
    }
  }
}

type ChatMsg = { role: string; content: string | any[] };
type GenOptions = { temperature?: number; top_p?: number; top_k?: number; repeat_penalty?: number } | undefined;

const num = (v: any): number => (typeof v === 'string' ? parseFloat(v) : Number(v));

/** Payload antigo (OPENROUTER_PAYLOAD=v1), sem mudança de comportamento. */
export function buildPayloadV1(model: string, messages: ChatMsg[], options: GenOptions): any {
  const body: any = {
    model,
    messages,
    // Desativa o thinking do DeepSeek e exclui os tokens de raciocínio da resposta.
    // "exclude: true" é essencial — sem ele o modelo ainda processa o thinking
    // antes de responder, mesmo com effort: none.
    reasoning: { effort: 'none', exclude: true },
    // Limitar tokens de saída para respostas rápidas no WhatsApp
    max_tokens: 1024,
    // Fornecedor mais rápido do modelo: no teste de 27/10 (n=5) o padrão caía num fornecedor
    // lento (2-18 s) e com 3/10 respostas vazias; o mais rápido respondeu em <1,5 s, 5/5 e mais barato.
    provider: { sort: process.env.OPENROUTER_PROVIDER_SORT || 'throughput' },
  };
  // Item 1 (TURN_METRICS): pede o usage completo (custo/cache). O OpenRouter já o devolve
  // por padrão; o campo é aceito e só deixa explícito.
  if (turnMetricsEnabled()) body.usage = { include: true };
  if (options?.temperature !== undefined) body.temperature = num(options.temperature);
  if (options?.top_p !== undefined) body.top_p = num(options.top_p);
  // top_k: documentado pelo OpenRouter (integer >= 0)
  if (options?.top_k !== undefined) {
    body.top_k = typeof options.top_k === 'string' ? parseInt(options.top_k, 10) : Number(options.top_k);
  }
  // repetition_penalty: range 0.0–2.0 no OpenRouter (>1.0 penaliza repetição)
  // Valores < 1.0 encorajam repetição — garantir que seja pelo menos 1.0
  if (options?.repeat_penalty !== undefined) {
    const raw = num(options.repeat_penalty);
    body.repetition_penalty = raw < 1.0 ? 1.0 : raw;
  }
  return body;
}

/**
 * Item 4 (OPENROUTER_PAYLOAD=v2): cada coisa no seu lugar.
 * - messages: system fixo + histórico user/assistant + user final (montados por quem chama);
 * - session_id por conversa (mesmo fornecedor por ~10 min e melhor cache);
 * - sem usage.include (obsoleto: o usage sempre volta);
 * - sem top_k/repetition_penalty (o painel tinha 100/0,5→1,0, praticamente neutros, e eles podem
 *   tirar fornecedores); temperature/top_p continuam vindo do painel;
 * - max_tokens por OPENROUTER_MAX_TOKENS (padrão 1024, igual ao antigo);
 * - provider por OPENROUTER_PROVIDER_MODE (sort antigo | default | price).
 */
export function buildPayloadV2(model: string, messages: ChatMsg[], options: GenOptions, extra?: { sessionId?: string }): any {
  const body: any = { model };
  if (extra?.sessionId) body.session_id = String(extra.sessionId).slice(0, 256);
  body.messages = messages;
  if (options?.temperature !== undefined && Number.isFinite(num(options.temperature))) body.temperature = num(options.temperature);
  if (options?.top_p !== undefined && Number.isFinite(num(options.top_p))) body.top_p = num(options.top_p);
  body.max_tokens = envInt('OPENROUTER_MAX_TOKENS', 1024, 1);
  body.reasoning = { effort: 'none', exclude: true };
  const provider = openrouterProviderConfig();
  if (provider) body.provider = provider;
  return body;
}
