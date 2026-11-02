import { AsyncLocalStorage } from 'async_hooks';
import fs from 'fs';
import path from 'path';
import logger from './logger';
import { turnMetricsEnabled } from './agentFlags';

/**
 * Item 1 do plano de turnos (02/11/2026): uma linha JSON por turno da IA em logs/turnos.jsonl
 * (TURN_METRICS=on). Sem conteúdo de mensagem nem telefone: só ids, tamanhos, tokens, custo e ms.
 *
 * O contexto do turno é propagado com AsyncLocalStorage, então o OpenRouterService registra as
 * chamadas (geração e embeddings) sem mudar as assinaturas no meio do caminho.
 */

export interface LlmCall {
  kind: 'chat' | 'embedding';
  model: string;
  provider?: string | null;
  ms: number;
  ok: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  cost?: number;
}

export class TurnContext {
  readonly startedAt = Date.now();
  readonly stages: Record<string, number> = {};
  readonly calls: LlmCall[] = [];
  outcome = 'respondido';
  sends = 0;
  constructor(readonly meta: Record<string, any>) {}

  addStage(name: string, ms: number): void {
    this.stages[name] = (this.stages[name] || 0) + Math.max(0, Math.round(ms));
  }
}

const storage = new AsyncLocalStorage<TurnContext>();

export function currentTurn(): TurnContext | undefined {
  return storage.getStore();
}

/** Mede uma etapa do turno atual (acumula se a etapa se repetir). Sem turno, só executa. */
export async function timeStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const ctx = storage.getStore();
  if (!ctx) return fn();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    ctx.addStage(name, Date.now() - t0);
  }
}

export function recordLlmCall(call: LlmCall): void {
  const ctx = storage.getStore();
  if (ctx) ctx.calls.push(call);
}

/** Extrai as métricas do `usage` do OpenRouter (formato OpenAI + cost). */
export function usageFields(usage: any): Partial<LlmCall> {
  if (!usage || typeof usage !== 'object') return {};
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    prompt_tokens: num(usage.prompt_tokens),
    completion_tokens: num(usage.completion_tokens),
    cached_tokens: num(usage.prompt_tokens_details?.cached_tokens),
    reasoning_tokens: num(usage.completion_tokens_details?.reasoning_tokens),
    cost: num(usage.cost),
  };
}

export function metricsFilePath(): string {
  return process.env.TURN_METRICS_FILE || path.join(process.cwd(), 'logs', 'turnos.jsonl');
}

export function buildTurnRecord(ctx: TurnContext): Record<string, any> {
  const chats = ctx.calls.filter((c) => c.kind === 'chat');
  const embs = ctx.calls.filter((c) => c.kind === 'embedding');
  const sum = (list: LlmCall[], k: keyof LlmCall) =>
    list.reduce((acc, c) => acc + (typeof c[k] === 'number' ? (c[k] as number) : 0), 0);
  const lastChat = chats[chats.length - 1];
  const llmMs = sum(chats, 'ms');
  const ms: Record<string, number> = { ...ctx.stages, llm: llmMs, embeddings: sum(embs, 'ms') };
  // "contexto" = montagem do prompt (RAG, histórico, embeddings) = etapa de geração menos o LLM.
  if (typeof ctx.stages.geracao === 'number') {
    ms.contexto = Math.max(0, ctx.stages.geracao - llmMs);
    delete ms.geracao;
  }
  ms.total = Date.now() - ctx.startedAt + (ctx.stages.debounce || 0);
  const costChat = sum(chats, 'cost');
  const costEmb = sum(embs, 'cost');
  return {
    ts: new Date().toISOString(),
    ...ctx.meta,
    outcome: ctx.outcome,
    envios: ctx.sends,
    model: lastChat?.model ?? null,
    provider: lastChat?.provider ?? null,
    llm_calls: chats.length,
    llm_failed: chats.filter((c) => !c.ok).length,
    tokens_in: sum(chats, 'prompt_tokens'),
    tokens_out: sum(chats, 'completion_tokens'),
    tokens_cache: sum(chats, 'cached_tokens'),
    tokens_reasoning: sum(chats, 'reasoning_tokens'),
    embedding_calls: embs.length,
    embedding_tokens: sum(embs, 'prompt_tokens'),
    cost_usd: Number((costChat + costEmb).toFixed(8)),
    cost_llm_usd: Number(costChat.toFixed(8)),
    cost_embedding_usd: Number(costEmb.toFixed(8)),
    ms,
  };
}

/**
 * Executa um turno com medição (se TURN_METRICS=on) e grava a linha ao final, mesmo com erro.
 * Falha ao gravar a métrica nunca afeta o atendimento.
 */
export async function runMeasuredTurn<T>(meta: Record<string, any>, fn: () => Promise<T>): Promise<T> {
  if (!turnMetricsEnabled()) return fn();
  const ctx = new TurnContext(meta);
  if (typeof meta.debounce_ms === 'number') {
    ctx.addStage('debounce', meta.debounce_ms);
    delete ctx.meta.debounce_ms;
  }
  try {
    return await storage.run(ctx, fn);
  } catch (error) {
    ctx.outcome = 'erro';
    throw error;
  } finally {
    try {
      const file = metricsFilePath();
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.appendFile(file, JSON.stringify(buildTurnRecord(ctx)) + '\n', 'utf8');
    } catch (error: any) {
      logger.warn(`Não foi possível gravar métrica do turno: ${error.message}`);
    }
  }
}
