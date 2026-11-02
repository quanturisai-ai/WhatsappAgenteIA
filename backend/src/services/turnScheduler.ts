import logger from '../utils/logger';
import { TurnControl } from '../utils/turnControl';

/**
 * Item 2 do plano de turnos (02/11/2026): agendador de turnos da IA por conversa.
 *
 * - Debounce: espera `baseMs` (5 s) depois da última mensagem; `greetingMs` (8 s) se o que chegou
 *   até agora é só uma saudação curta (≤ 3 palavras, sem "?"); nunca passa de `maxMs` (15 s)
 *   desde a 1ª mensagem do lote.
 * - Trava: um turno por conversa de cada vez.
 * - Epoch/cancelamento: mensagem nova incrementa o epoch e aborta o turno em andamento. Se o turno
 *   ainda não enviou, ele é descartado e o lote volta para a fila, junto com a mensagem nova
 *   (refaz com tudo junto). Se já começou a enviar, a mensagem nova vira o próximo turno.
 * - Anti-loop: mais de `maxIn` mensagens em `inWindowMs` ou mais de `maxOut` respostas em
 *   `outWindowMs` → descarta a fila, aborta o turno e chama `onLoop` (pausar a IA e avisar).
 * - A fila guarda IDs de mensagem (WhatsApp e banco), não só o texto.
 */

export interface PendingItem {
  /** message_id do WhatsApp */
  messageId?: string;
  /** id da linha em `messages` */
  dbId?: number;
  content: string;
  /** hora de chegada (ms) */
  at: number;
}

/** Resultado do turno: enviado, descartado por mensagem nova, ou terminou sem enviar. */
export type TurnResult = 'sent' | 'superseded' | 'done';

export interface TurnInfo {
  /** espera desde a 1ª mensagem do lote (ms), contando tentativas descartadas */
  debounceMs: number;
  /** quantas vezes este lote já foi refeito por mensagem nova */
  retries: number;
}

export type RunTurn = (conversationId: number, batch: PendingItem[], control: TurnControl, info: TurnInfo) => Promise<TurnResult>;
export type OnLoop = (conversationId: number, reason: string) => void | Promise<void>;

export interface SchedulerConfig {
  baseMs: number;
  greetingMs: number;
  maxMs: number;
  antiLoop: {
    enabled: boolean;
    maxIn: number;
    inWindowMs: number;
    maxOut: number;
    outWindowMs: number;
    /** depois de disparar, não dispara de novo nesta conversa por este tempo */
    cooldownMs: number;
  };
}

interface ConvState {
  pending: PendingItem[];
  /** 1ª mensagem da fila atual (base do teto maxMs) */
  firstAt?: number;
  /** 1ª mensagem do lote original (para medir a espera total, mesmo após refazer) */
  batchStartedAt?: number;
  retries: number;
  timer?: NodeJS.Timeout;
  epoch: number;
  running: Promise<void> | null;
  abort: AbortController | null;
  inTimes: number[];
  outTimes: number[];
  loopUntil: number;
}

const SAUDACAO_CURTA_MAX_PALAVRAS = 3;

/** "Oi", "Bom dia", "boa tarde tudo bem" etc.: até 3 palavras e sem "?". */
export function isShortGreeting(texts: string[]): boolean {
  const joined = texts.join(' ').trim();
  if (!joined || joined.includes('?')) return false;
  if (/^\[[a-z]+\]$/i.test(joined)) return false; // [media], [audio] etc.
  const words = joined.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length > 0 && words.length <= SAUDACAO_CURTA_MAX_PALAVRAS;
}

export class TurnScheduler {
  private states = new Map<number, ConvState>();

  constructor(
    private readonly runTurn: RunTurn,
    private readonly onLoop: OnLoop,
    private readonly config: () => SchedulerConfig,
    private readonly now: () => number = Date.now
  ) {}

  private state(conversationId: number): ConvState {
    let st = this.states.get(conversationId);
    if (!st) {
      st = { pending: [], retries: 0, epoch: 0, running: null, abort: null, inTimes: [], outTimes: [], loopUntil: 0 };
      this.states.set(conversationId, st);
    }
    return st;
  }

  /** Mensagem do cliente chegou (já gravada). */
  enqueue(conversationId: number, item: Omit<PendingItem, 'at'> & { at?: number }): void {
    const st = this.state(conversationId);
    const at = item.at ?? this.now();
    st.epoch++;

    if (this.checkLoop(conversationId, st, 'in', at)) return;

    st.pending.push({ ...item, at });
    if (st.firstAt === undefined) st.firstAt = at;
    if (st.batchStartedAt === undefined) st.batchStartedAt = at;

    if (st.running && st.abort && !st.abort.signal.aborted) {
      logger.info(`[turnos] Conversa ${conversationId}: mensagem nova durante o turno, cancelando para refazer com tudo junto`);
      st.abort.abort();
    }
    this.schedule(conversationId, st);
  }

  /** Para inspeção em testes/diagnóstico. */
  snapshot(conversationId: number): { pending: number; running: boolean; epoch: number } {
    const st = this.states.get(conversationId);
    return { pending: st?.pending.length ?? 0, running: !!st?.running, epoch: st?.epoch ?? 0 };
  }

  /** Espera o turno em andamento (testes). */
  async idle(conversationId: number): Promise<void> {
    const st = this.states.get(conversationId);
    while (st && (st.running || st.timer)) {
      if (st.running) await st.running;
      else await new Promise((r) => setTimeout(r, 5));
    }
  }

  private delayFor(st: ConvState): number {
    const cfg = this.config();
    const last = st.pending[st.pending.length - 1];
    const wait = isShortGreeting(st.pending.map((p) => p.content)) ? cfg.greetingMs : cfg.baseMs;
    let fireAt = last.at + wait;
    if (st.firstAt !== undefined) fireAt = Math.min(fireAt, st.firstAt + cfg.maxMs);
    return Math.max(0, fireAt - this.now());
  }

  private schedule(conversationId: number, st: ConvState): void {
    if (st.timer) clearTimeout(st.timer);
    st.timer = undefined;
    if (st.pending.length === 0) return;
    // Com turno em andamento, o próximo é agendado quando ele terminar.
    if (st.running) return;
    st.timer = setTimeout(() => this.fire(conversationId), this.delayFor(st));
  }

  private fire(conversationId: number): void {
    const st = this.state(conversationId);
    st.timer = undefined;
    if (st.running || st.pending.length === 0) return;

    const batch = st.pending;
    const startedAt = st.batchStartedAt ?? batch[0].at;
    const retries = st.retries;
    st.pending = [];
    st.firstAt = undefined;

    const epoch = st.epoch;
    const ac = new AbortController();
    st.abort = ac;
    const control: TurnControl = {
      epoch,
      signal: ac.signal,
      isCurrent: () => st.epoch === epoch && !ac.signal.aborted,
    };

    st.running = (async () => {
      let result: TurnResult = 'done';
      try {
        result = await this.runTurn(conversationId, batch, control, { debounceMs: this.now() - startedAt, retries });
      } catch (error: any) {
        logger.error(`[turnos] Erro no turno da conversa ${conversationId}: ${error?.message || error}`);
      } finally {
        st.running = null;
        st.abort = null;
        const loopJustTripped = result === 'superseded' && st.loopUntil > 0 && this.now() < st.loopUntil && st.pending.length === 0;
        if (result === 'superseded' && !loopJustTripped) {
          // Refaz com tudo junto: lote descartado + mensagens novas.
          st.pending = [...batch, ...st.pending];
          st.retries = retries + 1;
          if (st.firstAt === undefined) st.firstAt = this.now();
        } else {
          st.batchStartedAt = st.pending.length ? st.pending[0].at : undefined;
          st.retries = 0;
          if (result === 'sent') this.checkLoop(conversationId, st, 'out', this.now());
        }
        this.schedule(conversationId, st);
      }
    })();
  }

  /** Registra o evento e dispara o anti-loop se passar do limite. true = disparou. */
  private checkLoop(conversationId: number, st: ConvState, kind: 'in' | 'out', at: number): boolean {
    const cfg = this.config().antiLoop;
    if (!cfg.enabled) return false;
    const list = kind === 'in' ? st.inTimes : st.outTimes;
    const windowMs = kind === 'in' ? cfg.inWindowMs : cfg.outWindowMs;
    const max = kind === 'in' ? cfg.maxIn : cfg.maxOut;
    list.push(at);
    while (list.length && list[0] <= at - windowMs) list.shift();
    // Já disparou: não avisa de novo durante o resfriamento. As mensagens seguem o fluxo normal
    // (com a IA pausada o turno termina como "pausado"; se o dono reativar, ela volta a responder).
    if (at < st.loopUntil) return false;
    if (list.length <= max) return false;

    const reason = kind === 'in'
      ? `${list.length} mensagens do cliente em ${Math.round(windowMs / 60000)} min`
      : `${list.length} respostas da IA em ${Math.round(windowMs / 60000)} min`;
    logger.warn(`[turnos] Anti-loop na conversa ${conversationId}: ${reason}. Pausando a IA.`);
    st.loopUntil = at + cfg.cooldownMs;
    st.pending = [];
    st.firstAt = undefined;
    st.batchStartedAt = undefined;
    if (st.timer) clearTimeout(st.timer);
    st.timer = undefined;
    if (st.abort && !st.abort.signal.aborted) st.abort.abort();
    st.inTimes = [];
    st.outTimes = [];
    Promise.resolve()
      .then(() => this.onLoop(conversationId, reason))
      .catch((e: any) => logger.error(`[turnos] Erro ao tratar anti-loop da conversa ${conversationId}: ${e?.message || e}`));
    return true;
  }
}

/** Configuração a partir do .env (lida a cada uso; o .env só muda com reinício). */
export function schedulerConfigFromEnv(envInt: (name: string, fallback: number, min?: number) => number, antiLoop: boolean): SchedulerConfig {
  return {
    baseMs: envInt('DEBOUNCE_BASE_MS', 5000),
    greetingMs: envInt('DEBOUNCE_GREETING_MS', 8000),
    maxMs: envInt('DEBOUNCE_MAX_MS', 15000),
    antiLoop: {
      enabled: antiLoop,
      maxIn: envInt('ANTILOOP_MAX_IN', 8, 1),
      inWindowMs: envInt('ANTILOOP_IN_WINDOW_MS', 120000, 1000),
      maxOut: envInt('ANTILOOP_MAX_OUT', 20, 1),
      outWindowMs: envInt('ANTILOOP_OUT_WINDOW_MS', 600000, 1000),
      cooldownMs: envInt('ANTILOOP_COOLDOWN_MS', 1800000, 0),
    },
  };
}
