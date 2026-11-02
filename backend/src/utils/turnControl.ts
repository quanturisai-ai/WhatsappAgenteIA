import { AsyncLocalStorage } from 'async_hooks';

/**
 * Item 2 do plano de turnos: controle do turno em andamento (epoch + cancelamento).
 * O agendador cria um TurnControl por turno; mensagem nova na conversa incrementa o epoch e
 * aborta o sinal. Quem chama o LLM (OpenRouterService) passa o `signal` ao axios, e o
 * ConversationService confere `isCurrent()` antes de enviar.
 */
export interface TurnControl {
  epoch: number;
  signal: AbortSignal;
  isCurrent(): boolean;
}

const store = new AsyncLocalStorage<TurnControl>();

export function runWithTurnControl<T>(control: TurnControl | undefined, fn: () => Promise<T>): Promise<T> {
  return control ? store.run(control, fn) : fn();
}

export function currentTurnControl(): TurnControl | undefined {
  return store.getStore();
}

/** Erro de "turno substituído por mensagem nova" (não é falha: não marca intervenção nem faz fallback). */
export class TurnSupersededError extends Error {
  constructor() {
    super('Turno substituído por mensagem nova');
    this.name = 'TurnSupersededError';
  }
}

/** true se o erro veio de cancelamento (axios CanceledError/AbortError) ou de turno substituído. */
export function isTurnAbort(error: any): boolean {
  if (!error) return false;
  if (error instanceof TurnSupersededError) return true;
  const ctl = currentTurnControl();
  if (ctl && ctl.signal.aborted) return true;
  return error.name === 'CanceledError' || error.name === 'AbortError' || error.code === 'ERR_CANCELED';
}
