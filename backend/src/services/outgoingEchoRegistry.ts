import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { MessageSource } from '../types';

/**
 * Registro de envios pendentes para casar o eco `message_create` com a conversa certa.
 *
 * Problema (item 0 do plano de 02/11/2026): o eco de uma mensagem enviada chega com o JID
 * de destino (ex.: `...@lid`) e era resolvido de novo pelo contato. Quando existe outra
 * conversa com `contact_number` igual aos dígitos do LID, a resposta da IA era gravada nela.
 *
 * Solução: antes do envio, quem envia registra { conversationId, source } com a chave
 * chatId + tipo + hash do texto/legenda. No eco, o registro é consumido (uma vez só) e a
 * mensagem vai para a conversa registrada, com o source registrado.
 *
 * O eco pode chegar antes de `client.sendMessage` resolver (SyncZap emite `message_create`
 * de dentro do próprio sendMessage), por isso o registro é feito ANTES do envio.
 *
 * Correlação exata: o envio roda dentro de `echoTokenStore.run(token, ...)`. Como o SyncZap
 * emite o eco no mesmo contexto assíncrono, o listener lê o token e consome exatamente aquele
 * registro (conferindo chat + hash). Sem token (ex.: whatsapp-web.js), casa pelo id ou por
 * chat + hash; se houver registros ambíguos para conversas diferentes, não chuta a conversa.
 */

/** Token do envio em andamento, propagado até o listener do eco. */
export const echoTokenStore = new AsyncLocalStorage<string>();

export interface OutgoingIntent {
  conversationId: number | null;
  source: MessageSource;
  isFromAI: boolean;
  mediaId?: number | null;
}

interface Entry extends OutgoingIntent {
  token: string;
  key: string;
  hashKey: string;
  messageId?: string;
  /** false enquanto o envio está em andamento (não expira); true depois de settle(). */
  settled: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface EchoLike {
  id?: { _serialized?: string } | null;
  to?: string;
  from?: string;
  body?: string;
  hasMedia?: boolean;
  _data?: { caption?: string } | null;
}

export function normalizeChatId(chatId: string): string {
  const raw = (chatId || '').trim().toLowerCase();
  if (raw.endsWith('@s.whatsapp.net')) return raw.replace('@s.whatsapp.net', '@c.us');
  return raw;
}

function textHash(text: string): string {
  return crypto.createHash('sha1').update(text || '', 'utf8').digest('hex');
}

export class OutgoingEchoRegistry {
  private byKey = new Map<string, Entry[]>();
  private byToken = new Map<string, Entry>();
  private byMessageId = new Map<string, Entry>();
  private seq = 0;

  /**
   * ttlMs: quanto o registro espera o eco depois que o envio terminou.
   * maxPendingMs: teto de segurança para registros cujo envio nunca terminou (vazamento).
   */
  constructor(
    private readonly ttlMs: number = 120_000,
    private readonly now: () => number = Date.now,
    private readonly maxPendingMs: number = 30 * 60_000,
  ) {}

  static hashKey(text: string, hasMedia: boolean): string {
    return `${hasMedia ? 'm' : 't'}|${textHash(text)}`;
  }

  static key(chatId: string, text: string, hasMedia: boolean): string {
    return `${normalizeChatId(chatId)}|${OutgoingEchoRegistry.hashKey(text, hasMedia)}`;
  }

  /** Registra um envio que está para acontecer. Devolve um token para bind/release. */
  register(chatId: string, text: string, hasMedia: boolean, intent: OutgoingIntent): string {
    this.sweep();
    const token = `t${++this.seq}`;
    const entry: Entry = {
      ...intent,
      token,
      key: OutgoingEchoRegistry.key(chatId, text, hasMedia),
      hashKey: OutgoingEchoRegistry.hashKey(text, hasMedia),
      settled: false,
      createdAt: this.now(),
      expiresAt: Number.POSITIVE_INFINITY,
    };
    const list = this.byKey.get(entry.key) || [];
    list.push(entry);
    this.byKey.set(entry.key, list);
    this.byToken.set(token, entry);
    return token;
  }

  /**
   * Envio terminou com sucesso: liga ao id real (se houver) e começa a contar o TTL.
   * O eco do SyncZap normalmente já consumiu o registro antes disto.
   */
  settle(token: string, messageId: string | undefined | null): void {
    const entry = this.byToken.get(token);
    if (!entry) return;
    entry.settled = true;
    entry.expiresAt = this.now() + this.ttlMs;
    if (messageId) {
      entry.messageId = messageId;
      this.byMessageId.set(messageId, entry);
    }
  }

  /** Envio falhou: o registro não deve casar com nada. */
  release(token: string): void {
    const entry = this.byToken.get(token);
    if (entry) this.remove(entry);
  }

  /**
   * Consome o registro que corresponde ao eco. Ordem:
   * 1. token do envio em andamento (correlação exata), se o chat + hash conferem;
   * 2. id da mensagem;
   * 3. chat + hash: um registro só, ou vários equivalentes (mesma conversa/origem). Se forem
   *    de conversas diferentes, devolve a origem comum com conversationId=null (a conversa é
   *    resolvida pelo contato, como antes) ou null se nem a origem for comum.
   * Nunca casa por hash ignorando o chat.
   */
  take(msg: EchoLike, token?: string | null): OutgoingIntent | null {
    this.sweep();
    const hasMedia = !!msg.hasMedia;
    const text = hasMedia ? (msg._data?.caption ?? msg.body ?? '') : (msg.body ?? '');
    const chat = msg.to || msg.from || '';
    const key = OutgoingEchoRegistry.key(chat, text, hasMedia);

    if (token) {
      const byToken = this.byToken.get(token);
      if (byToken && byToken.key === key) {
        this.remove(byToken);
        return this.toIntent(byToken);
      }
    }

    const messageId = msg.id?._serialized || '';
    if (messageId) {
      const byId = this.byMessageId.get(messageId);
      if (byId) {
        this.remove(byId);
        return this.toIntent(byId);
      }
    }

    const list = this.byKey.get(key);
    if (!list || list.length === 0) return null;
    const first = list[0];
    if (list.length === 1) {
      this.remove(first);
      return this.toIntent(first);
    }
    const sameConversation = list.every((e) => e.conversationId === first.conversationId && e.source === first.source && e.isFromAI === first.isFromAI && (e.mediaId ?? null) === (first.mediaId ?? null));
    if (sameConversation) {
      this.remove(first);
      return this.toIntent(first);
    }
    const sameOrigin = list.every((e) => e.source === first.source && e.isFromAI === first.isFromAI);
    if (sameOrigin) {
      this.remove(first);
      return { ...this.toIntent(first), conversationId: null, mediaId: null };
    }
    return null;
  }

  size(): number {
    return this.byToken.size;
  }

  private toIntent(e: Entry): OutgoingIntent {
    return { conversationId: e.conversationId, source: e.source, isFromAI: e.isFromAI, mediaId: e.mediaId ?? null };
  }

  private remove(entry: Entry): void {
    this.byToken.delete(entry.token);
    if (entry.messageId) this.byMessageId.delete(entry.messageId);
    const list = this.byKey.get(entry.key);
    if (list) {
      const rest = list.filter((e) => e !== entry);
      if (rest.length > 0) this.byKey.set(entry.key, rest);
      else this.byKey.delete(entry.key);
    }
  }

  private sweep(): void {
    const t = this.now();
    for (const entry of [...this.byToken.values()]) {
      const expired = entry.settled ? entry.expiresAt <= t : t - entry.createdAt >= this.maxPendingMs;
      if (expired) this.remove(entry);
    }
  }
}
