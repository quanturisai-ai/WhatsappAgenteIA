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
