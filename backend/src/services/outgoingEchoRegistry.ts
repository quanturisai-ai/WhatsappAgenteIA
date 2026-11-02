import crypto from 'crypto';
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
 */

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

  constructor(private readonly ttlMs: number = 120_000, private readonly now: () => number = Date.now) {}

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
      expiresAt: this.now() + this.ttlMs,
    };
    const list = this.byKey.get(entry.key) || [];
    list.push(entry);
    this.byKey.set(entry.key, list);
    this.byToken.set(token, entry);
    return token;
  }

  /** Depois que o envio devolveu o id real: permite casar o eco também pelo id. */
  bindMessageId(token: string, messageId: string | undefined | null): void {
    const entry = this.byToken.get(token);
    if (!entry || !messageId) return;
    entry.messageId = messageId;
    this.byMessageId.set(messageId, entry);
  }

  /** Envio falhou: o registro não deve casar com nada. */
  release(token: string): void {
    const entry = this.byToken.get(token);
    if (entry) this.remove(entry);
  }

  /**
   * Consome o registro que corresponde ao eco. Ordem: id da mensagem; chatId + hash;
   * só hash, se houver exatamente um registro pendente com esse hash (o eco do
   * whatsapp-web.js pode trazer outro formato de JID). Devolve null se não houver.
   */
  take(msg: EchoLike): OutgoingIntent | null {
    this.sweep();
    const messageId = msg.id?._serialized || '';
    if (messageId) {
      const byId = this.byMessageId.get(messageId);
      if (byId) {
        this.remove(byId);
        return this.toIntent(byId);
      }
    }

    const hasMedia = !!msg.hasMedia;
    const text = hasMedia ? (msg._data?.caption ?? msg.body ?? '') : (msg.body ?? '');
    const chat = msg.to || msg.from || '';
    const key = OutgoingEchoRegistry.key(chat, text, hasMedia);
    const list = this.byKey.get(key);
    if (list && list.length > 0) {
      const entry = list[0];
      this.remove(entry);
      return this.toIntent(entry);
    }

    const hk = OutgoingEchoRegistry.hashKey(text, hasMedia);
    const candidates: Entry[] = [];
    for (const entries of this.byKey.values()) {
      for (const e of entries) if (e.hashKey === hk && !e.messageId) candidates.push(e);
    }
    if (candidates.length === 1) {
      this.remove(candidates[0]);
      return this.toIntent(candidates[0]);
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
      if (entry.expiresAt <= t) this.remove(entry);
    }
  }
}
