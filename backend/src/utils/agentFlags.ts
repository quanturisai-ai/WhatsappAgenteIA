import { normalizePhoneNumber } from './phoneUtils';

/**
 * Interruptores das mudanças do plano de turnos (02/11/2026). Variável ausente ou com o
 * valor antigo = comportamento antigo. Lidos a cada chamada (o .env só muda com reinício).
 */

function parseList(value: string | undefined): string[] {
  return (value || '')
    .split(/[,;\s]+/)
    .map((v) => v.replace(/\D/g, ''))
    .filter((v) => v.length >= 8);
}

function sameNumber(a: string, b: string): boolean {
  const da = (a || '').replace(/\D/g, '');
  const db = (b || '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  return normalizePhoneNumber(da) === normalizePhoneNumber(db);
}

/** Números de teste do dono (AGENTE_TEST_NUMBERS), usados nos modos "test". */
export function isTestNumber(contactNumber: string | null | undefined): boolean {
  if (!contactNumber) return false;
  return parseList(process.env.AGENTE_TEST_NUMBERS).some((n) => sameNumber(n, contactNumber));
}

/** Números do dono autorizados a usar #contatoia além dos atendentes ativos. */
export function isOwnerNumber(contactNumber: string | null | undefined): boolean {
  if (!contactNumber) return false;
  return parseList(process.env.CONTATOIA_OWNER_NUMBERS).some((n) => sameNumber(n, contactNumber));
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return sameNumber(a || '', b || '');
}

export type EchoBindingMode = 'off' | 'test' | 'on';

/** OUTGOING_ECHO_BINDING: off (antigo) | test (só AGENTE_TEST_NUMBERS) | on (todos). */
export function echoBindingMode(): EchoBindingMode {
  const v = (process.env.OUTGOING_ECHO_BINDING || 'off').trim().toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return 'on';
  if (v === 'test') return 'test';
  return 'off';
}

export function echoBindingAppliesTo(contactNumber: string | null | undefined): boolean {
  const mode = echoBindingMode();
  if (mode === 'on') return true;
  if (mode === 'test') return isTestNumber(contactNumber);
  return false;
}

/** CONTATOIA_RESTRICT: on = só dono/atendente pode usar #contatoia; off = antigo (qualquer um). */
export function contatoiaRestricted(): boolean {
  const v = (process.env.CONTATOIA_RESTRICT || 'off').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

/** TURN_METRICS: on = grava uma linha JSON por turno em logs/turnos.jsonl; off = antigo. */
export function turnMetricsEnabled(): boolean {
  const v = (process.env.TURN_METRICS || 'off').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

export type RolloutMode = 'off' | 'test' | 'on';

function rolloutMode(name: string): RolloutMode {
  const v = (process.env[name] || 'off').trim().toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return 'on';
  if (v === 'test') return 'test';
  return 'off';
}

function rolloutAppliesTo(name: string, contactNumber: string | null | undefined): boolean {
  const mode = rolloutMode(name);
  if (mode === 'on') return true;
  if (mode === 'test') return isTestNumber(contactNumber);
  return false;
}

/**
 * TURN_SCHEDULER (item 2): off = debounce antigo (janela fixa MESSAGE_DEBOUNCE_MS, sem trava);
 * test = só AGENTE_TEST_NUMBERS; on = todos. Ligado: debounce 5/8/15 s, um turno por conversa,
 * mensagem nova cancela e refaz (epoch), anti-loop (ANTILOOP).
 */
export function turnSchedulerMode(): RolloutMode {
  return rolloutMode('TURN_SCHEDULER');
}
export function turnSchedulerAppliesTo(contactNumber: string | null | undefined): boolean {
  return rolloutAppliesTo('TURN_SCHEDULER', contactNumber);
}

/** ANTILOOP (item 2, só com TURN_SCHEDULER ligado): on = pausa a IA e avisa o atendente em rajada. */
export function antiLoopEnabled(): boolean {
  const v = (process.env.ANTILOOP || 'off').trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

/**
 * HISTORY_MESSAGES (item 3): off = histórico antigo (texto narrativo, 10 msgs / max_age_hours,
 * 2ª busca RAG e resumo); test = só AGENTE_TEST_NUMBERS; on = todos. Ligado: histórico como
 * mensagens user/assistant (HISTORY_MAX_MESSAGES / HISTORY_MAX_AGE_HOURS), sem a 2ª busca RAG.
 */
export function historyMessagesMode(): RolloutMode {
  return rolloutMode('HISTORY_MESSAGES');
}
export function historyMessagesAppliesTo(contactNumber: string | null | undefined): boolean {
  return rolloutAppliesTo('HISTORY_MESSAGES', contactNumber);
}

/** Inteiro positivo de variável de ambiente, com padrão para ausente/inválido. */
export function envInt(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/**
 * RAG_ENABLED (item 4): true (padrão, antigo) = prompt com busca RAG por turno; test = os números de
 * AGENTE_TEST_NUMBERS usam o system fixo do agente.yaml (base inteira, sem RAG) e os demais o antigo;
 * false = todos usam o system fixo. O chat de teste do painel (sem número) só no modo false.
 */
export function ragEnabledMode(): 'true' | 'test' | 'false' {
  const v = (process.env.RAG_ENABLED || 'true').trim().toLowerCase();
  if (v === 'false' || v === 'off' || v === '0') return 'false';
  if (v === 'test') return 'test';
  return 'true';
}
/** O system fixo do agente.yaml (sem RAG) vale para este contato? */
export function agenteYamlAppliesTo(contactNumber: string | null | undefined): boolean {
  const mode = ragEnabledMode();
  if (mode === 'false') return true;
  if (mode === 'test') return isTestNumber(contactNumber);
  return false;
}

/**
 * OPENROUTER_PAYLOAD (item 4): v1 (padrão, antigo) | v2 = JSON nas boas práticas: session_id por
 * conversa, sem usage.include (obsoleto), sem top_k/repetition_penalty, max_tokens por env.
 */
export function openrouterPayloadV2(agenteYaml = false): boolean {
  const v = (process.env.OPENROUTER_PAYLOAD || 'v1').trim().toLowerCase();
  // yaml = v2 só nos turnos do agente.yaml (acompanha RAG_ENABLED=test/false); os demais seguem no v1.
  return v === 'v2' || (v === 'yaml' && agenteYaml);
}

function envNum(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * OPENROUTER_PROVIDER_MODE (item 4), roteamento de fornecedor:
 * - vazio/sort (padrão, antigo): { sort: OPENROUTER_PROVIDER_SORT || 'throughput' };
 * - default: sem objeto provider (roteamento balanceado do OpenRouter);
 * - price: sort por preço + preferências de latência/throughput (não bloqueiam) + max_price (bloqueia).
 */
export function openrouterProviderMode(): 'sort' | 'default' | 'price' {
  const v = (process.env.OPENROUTER_PROVIDER_MODE || 'sort').trim().toLowerCase();
  if (v === 'default' || v === 'price') return v;
  return 'sort';
}
export function openrouterProviderConfig(): Record<string, any> | undefined {
  const mode = openrouterProviderMode();
  if (mode === 'default') return undefined;
  if (mode === 'sort') return { sort: process.env.OPENROUTER_PROVIDER_SORT || 'throughput' };
  const p: Record<string, any> = { sort: 'price' };
  const lat = envNum('OPENROUTER_PREFERRED_MAX_LATENCY_P90');
  if (lat !== undefined) p.preferred_max_latency = { p90: lat };
  const thr = envNum('OPENROUTER_PREFERRED_MIN_THROUGHPUT_P90');
  if (thr !== undefined) p.preferred_min_throughput = { p90: thr };
  const mp = envNum('OPENROUTER_MAX_PRICE_PROMPT');
  const mc = envNum('OPENROUTER_MAX_PRICE_COMPLETION');
  if (mp !== undefined || mc !== undefined) {
    p.max_price = {};
    if (mp !== undefined) p.max_price.prompt = mp;
    if (mc !== undefined) p.max_price.completion = mc;
  }
  return p;
}
