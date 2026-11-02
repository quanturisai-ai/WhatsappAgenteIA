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
