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
 * - A fila guarda IDs de mensagem (WhatsApp e banco), não só o texto, em ordem de chegada.
 * - Reserva (hold): assim que se sabe a conversa de uma mensagem nova (antes de baixar/transcrever
 *   áudio), o turno em andamento é cancelado e nada dispara até a mensagem entrar na fila (máx.
 *   `holdMaxMs`), para áudio + texto saírem juntos e na ordem.
 * - Prazo do turno: se um turno não termina em `turnDeadlineMs`, a trava é liberada (não fica
 *   presa para sempre) e `onStuck` é chamado.
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
export type OnStuck = (conversationId: number, ms: number) => void | Promise<void>;

export interface SchedulerConfig {
  baseMs: number;
  greetingMs: number;
  maxMs: number;
  /** prazo máximo de um turno (ms) antes de liberar a trava */
  turnDeadlineMs: number;
  /** tempo máximo que uma reserva (mensagem ainda sendo baixada/transcrita) segura a fila */
  holdMaxMs: number;
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
  /** o turno em andamento já passou da conferência e está enviando (não cancela mais) */
  committed: boolean;
  /** reservas abertas (mensagens que chegaram e ainda não entraram na fila) */
  holds: number;
  holdTimer?: NodeJS.Timeout;
  lastActivity: number;
  inTimes: number[];
  outTimes: number[];
  loopUntil: number;
}

const SAUDACAO_CURTA_MAX_PALAVRAS = 3;
const PALAVRAS_SAUDACAO = new Set([
  'oi', 'oie', 'ola', 'opa', 'eai', 'e', 'ai', 'bom', 'boa', 'boas', 'dia', 'tarde', 'noite',
  'tudo', 'bem', 'td', 'bm', 'blz', 'beleza', 'salve', 'hey', 'hello', 'hi', 'alo', 'boa-noite',
  'bom-dia', 'boa-tarde', 'tranquilo', 'joia', 'fala',
]);

function normalizarPalavra(w: string): string {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/(.)\1+/g, '$1'); // "oiii" -> "oi", "olaaa" -> "ola"
}

/** "Oi", "Bom dia", "boa tarde tudo bem" etc.: até 3 palavras, todas de saudação, e sem "?". */
export function isShortGreeting(texts: string[]): boolean {
  const joined = texts.join(' ').trim();
  if (!joined || joined.includes('?')) return false;
  if (/^\[[a-z]+\]$/i.test(joined)) return false; // [media], [audio] etc.
  const words = joined.split(/\s+/).map(normalizarPalavra).filter(Boolean);
  return words.length > 0 && words.length <= SAUDACAO_CURTA_MAX_PALAVRAS && words.every((w) => PALAVRAS_SAUDACAO.has(w));
}

export class TurnScheduler {
  private states = new Map<number, ConvState>();

  constructor(
    private readonly runTurn: RunTurn,
    private readonly onLoop: OnLoop,
    private readonly config: () => SchedulerConfig,
    private readonly now: () => number = Date.now,
    private readonly onStuck: OnStuck = () => {}
  ) {}

  private lastSweep = 0;

  /** Remove o estado de conversas ociosas (sem fila, turno, reserva, janelas ou resfriamento). */
  private sweep(): void {
    const now = this.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cfg = this.config();
    const keepMs = Math.max(cfg.antiLoop.inWindowMs, cfg.antiLoop.outWindowMs, cfg.maxMs, cfg.turnDeadlineMs);
    for (const [id, st] of this.states) {
      if (st.pending.length || st.running || st.timer || st.holds > 0) continue;
      if (now < st.loopUntil || now - st.lastActivity < keepMs) continue;
      this.states.delete(id);
    }
  }

  /** Cancela o turno em andamento, se ainda não começou a enviar. */
  private cancelRunning(conversationId: number, st: ConvState, why: string): void {
    if (st.running && st.abort && !st.abort.signal.aborted && !st.committed) {
      logger.info(`[turnos] Conversa ${conversationId}: ${why}, cancelando o turno para refazer com tudo junto`);
      st.abort.abort();
    }
  }

  /**
   * Mensagem nova chegando (ainda sendo gravada/baixada/transcrita): cancela o turno em andamento
   * e segura a fila até `release()` (ou `holdMaxMs`). Devolve a função de liberar (idempotente).
   */
  hold(conversationId: number): () => void {
    this.sweep();
    const st = this.state(conversationId);
    st.epoch++;
    st.holds++;
    st.lastActivity = this.now();
    this.cancelRunning(conversationId, st, 'mensagem nova chegando');
    if (st.timer) clearTimeout(st.timer);
    st.timer = undefined;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(safety);
      st.holds = Math.max(0, st.holds - 1);
      this.schedule(conversationId, st);
    };
    const safety = setTimeout(() => {
      if (!released) logger.warn(`[turnos] Conversa ${conversationId}: reserva expirou sem a mensagem entrar na fila`);
      release();
    }, this.config().holdMaxMs);
    return release;
  }

  private state(conversationId: number): ConvState {
    let st = this.states.get(conversationId);
    if (!st) {
      st = { pending: [], retries: 0, epoch: 0, running: null, abort: null, committed: false, holds: 0, lastActivity: this.now(), inTimes: [], outTimes: [], loopUntil: 0 };
      this.states.set(conversationId, st);
    }
    return st;
  }

  /** Mensagem do cliente chegou (já gravada). `at` = hora de chegada (ordem da fila). */
  enqueue(conversationId: number, item: Omit<PendingItem, 'at'> & { at?: number }): void {
    this.sweep();
    const st = this.state(conversationId);
    const at = item.at ?? this.now();
    st.epoch++;
    st.lastActivity = this.now();

    if (this.checkLoop(conversationId, st, 'in', at)) return;

    // Em ordem de chegada (um áudio que demorou para transcrever fica antes do texto que veio depois).
    let i = st.pending.length;
    while (i > 0 && st.pending[i - 1].at > at) i--;
    st.pending.splice(i, 0, { ...item, at });
    st.firstAt = st.firstAt === undefined ? at : Math.min(st.firstAt, at);
    st.batchStartedAt = st.batchStartedAt === undefined ? at : Math.min(st.batchStartedAt, at);

    this.cancelRunning(conversationId, st, 'mensagem nova durante o turno');
    this.schedule(conversationId, st);
  }

  /** Para inspeção em testes/diagnóstico. */
  snapshot(conversationId: number): { pending: number; running: boolean; epoch: number; holds: number; tracked: boolean } {
    const st = this.states.get(conversationId);
    return { pending: st?.pending.length ?? 0, running: !!st?.running, epoch: st?.epoch ?? 0, holds: st?.holds ?? 0, tracked: !!st };
  }

  /** Espera o turno em andamento (testes). */
  async idle(conversationId: number): Promise<void> {
    const st = this.states.get(conversationId);
    while (st && (st.running || st.timer || (st.holds > 0 && st.pending.length > 0))) {
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
    // Com turno em andamento, o próximo é agendado quando ele terminar; com reserva aberta, quando
    // a mensagem entrar na fila.
    if (st.running || st.holds > 0) return;
    st.timer = setTimeout(() => this.fire(conversationId), this.delayFor(st));
  }

  private fire(conversationId: number): void {
    const st = this.state(conversationId);
    st.timer = undefined;
    if (st.running || st.holds > 0 || st.pending.length === 0) return;

    const cfg = this.config();
    const batch = st.pending;
    const startedAt = st.batchStartedAt ?? batch[0].at;
    const retries = st.retries;
    st.pending = [];
    st.firstAt = undefined;

    const epoch = st.epoch;
    const ac = new AbortController();
    st.abort = ac;
    st.committed = false;
    let committed = false;
    const isCurrent = () => committed || (st.epoch === epoch && !ac.signal.aborted);
    const control: TurnControl = {
      epoch,
      signal: ac.signal,
      isCurrent,
      commit: () => {
        if (!isCurrent()) return false;
        committed = true;
        if (st.abort === ac) st.committed = true;
        return true;
      },
    };

    const turnStartedAt = this.now();
    let deadline: NodeJS.Timeout | undefined;
    const stuck = new Promise<'stuck'>((resolve) => {
      deadline = setTimeout(() => resolve('stuck'), cfg.turnDeadlineMs);
    });

    st.running = (async () => {
      let result: TurnResult = 'done';
      let timedOut = false;
      try {
        const r = await Promise.race([this.runTurn(conversationId, batch, control, { debounceMs: turnStartedAt - startedAt, retries }), stuck]);
        if (r === 'stuck') {
          timedOut = true;
          logger.error(`[turnos] Conversa ${conversationId}: turno passou de ${cfg.turnDeadlineMs} ms; liberando a trava`);
          if (!committed) ac.abort();
        } else {
          result = r;
        }
      } catch (error: any) {
        logger.error(`[turnos] Erro no turno da conversa ${conversationId}: ${error?.message || error}`);
      } finally {
        if (deadline) clearTimeout(deadline);
        // Só mexe no estado se este ainda é o turno da conversa.
        if (st.abort === ac) {
          st.running = null;
          st.abort = null;
          st.committed = false;
          st.lastActivity = this.now();
          const loopJustTripped = result === 'superseded' && st.loopUntil > 0 && this.now() < st.loopUntil && st.pending.length === 0;
          if (result === 'superseded' && !loopJustTripped) {
            // Refaz com tudo junto: lote descartado + mensagens novas. O teto conta desde a 1ª do lote.
            st.pending = [...batch, ...st.pending];
            st.retries = retries + 1;
            st.firstAt = Math.min(batch[0].at, st.firstAt ?? Infinity);
            st.batchStartedAt = Math.min(startedAt, st.batchStartedAt ?? Infinity);
          } else {
            st.batchStartedAt = st.pending.length ? st.pending[0].at : undefined;
            st.retries = 0;
            if (result === 'sent') this.checkLoop(conversationId, st, 'out', this.now());
          }
          this.schedule(conversationId, st);
        }
        if (timedOut) {
          Promise.resolve()
            .then(() => this.onStuck(conversationId, this.now() - turnStartedAt))
            .catch((e: any) => logger.error(`[turnos] Erro ao tratar turno travado da conversa ${conversationId}: ${e?.message || e}`));
        }
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
    if (st.abort && !st.abort.signal.aborted && !st.committed) st.abort.abort();
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
    turnDeadlineMs: envInt('TURN_DEADLINE_MS', 150000, 10000),
    holdMaxMs: envInt('TURN_HOLD_MAX_MS', 60000, 1000),
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
