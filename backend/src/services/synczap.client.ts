import { EventEmitter } from 'events';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

/**
 * Subconjunto do Client do whatsapp-web.js usado por whatsapp.service.ts,
 * falando com o gateway SyncZap por HTTP. logout() só fecha o stream.
 */

const CONTRACT_VERSION = '1.0.0';
const MEDIA_WAIT_MS = 60_000;
const STATUS_EVENT_MAX_AGE_MS = 120_000;
const SEQ_FILE = path.join(__dirname, '..', '..', 'whatsapp_sessions', 'synczap-seq.json');

type Destino = { phone?: string; jid?: string };

interface MediaPronta {
  url: string;
  mimetype: string;
  filename: string;
}

interface MediaDownload {
  mimetype: string;
  data: string;
  filename: string;
}

interface SeqFile {
  instance_id?: string;
  seq?: number;
  ids?: string[];
}

interface Envelope {
  id?: string;
  type?: string;
  instance_id?: string;
  chat_jid?: string;
  seq?: number;
  occurred_at?: string;
  payload?: unknown;
}

export class SyncZapClient extends EventEmitter {
  info: { wid: { user: string; _serialized: string }; pushname: string; platform: string } | undefined;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanceId: string;
  private waState = 'UNPAIRED';
  private lastSeq = 0;
  // O gateway pode emitir mais de um evento com o mesmo seq (ex.: media.ready usa o seq
  // da mensagem). Por isso a deduplicação no último seq é pelo id do evento.
  private idsNoSeq = new Set<string>();
  private stopping = false;
  private streamAbort: AbortController | null = null;
  private wake: (() => void) | null = null;
  private loop: Promise<void> | null = null;

  private sseId = '';
  private sseData: string[] = [];

  private batchToState: string | null = null;
  private batchReason = '';
  private batchQr: string | null = null;
  private batchAuthFailure: string | null = null;

  private mediaReady = new Map<string, MediaPronta>();
  private mediaFailed = new Map<string, string>();
  private mediaWaiters = new Map<string, Array<{ resolve: (m: MediaPronta) => void; reject: (e: Error) => void }>>();

  constructor() {
    super();
    this.baseUrl = (process.env.SYNCZ_BASE_URL || '').replace(/\/+$/, '');
    this.apiKey = process.env.SYNCZ_API_KEY || '';
    this.instanceId = process.env.SYNCZ_INSTANCE_ID || '';
    this.lastSeq = this.readSeq();
  }

  async initialize(): Promise<void> {
    this.assertConfig();
    this.stopping = false;
    const inst = await this.requestJson<{ status?: string; phone?: string; name?: string }>(
      'GET',
      `/api/v1/instances/${encodeURIComponent(this.instanceId)}`
    );
    this.rememberIdentity(inst.phone, inst.name);
    if (inst.status === 'connected') {
      this.waState = 'CONNECTED';
      this.emit('authenticated');
      this.emit('ready');
    } else {
      this.waState = 'UNPAIRED';
      try {
        const pairing = await this.requestJson<{ qr_code?: string; paired?: boolean; phone?: string }>(
          'GET',
          `/api/v1/instances/${encodeURIComponent(this.instanceId)}/pairing`
        );
        if (pairing.phone) this.rememberIdentity(pairing.phone, undefined);
        if (pairing.paired) {
          this.waState = 'OPENING';
        } else if (pairing.qr_code) {
          this.emit('qr', pairing.qr_code);
        }
      } catch (error: any) {
        logger.warn(`SyncZap pareamento indisponível: ${error.message}`);
      }
    }
    this.startLoop();
  }

  async destroy(): Promise<void> {
    this.stopStream();
  }

  async logout(): Promise<void> {
    this.stopStream();
  }

  async getState(): Promise<string> {
    return this.waState;
  }

  async getChats(): Promise<unknown[]> {
    return [];
  }

  async getChatById(id: string): Promise<{ id: { _serialized: string }; name: string; isGroup: boolean }> {
    const serialized = toWwebId(id);
    return {
      id: { _serialized: serialized },
      name: serialized,
      isGroup: serialized.endsWith('@g.us'),
    };
  }

  async getNumberId(id: string): Promise<{ _serialized: string } | null> {
    this.assertConfig();
    const digits = id.replace(/@.*/, '').replace(/\D/g, '');
    if (!digits) return null;
    const res = await this.requestJson<{
      results?: Array<{ phone?: string; is_in_whatsapp?: boolean; jid?: string }>;
    }>('POST', `/api/v1/instances/${encodeURIComponent(this.instanceId)}/check-numbers`, { phones: [digits] });
    const row = res.results && res.results[0];
    if (!row || !row.is_in_whatsapp) return null;
    const jid = row.jid ? toWwebId(row.jid) : '';
    if (jid.endsWith('@c.us')) return { _serialized: jid };
    const phone = (row.phone || digits).replace(/\D/g, '');
    if (!phone) return null;
    return { _serialized: `${phone}@c.us` };
  }

  async sendMessage(chatId: string, content: string | { mimetype?: string; data?: string; filename?: string | null }, options?: { caption?: string; sendSeen?: boolean }): Promise<any> {
    this.assertConfig();
    const destino = destinoDe(chatId);
    const idem = crypto.randomUUID();
    let messageId = '';
    let body = '';
    let wwebType = 'chat';
    let hasMedia = false;
    let mimetype = '';
    let filename = '';
    let dataB64 = '';

    if (typeof content === 'string') {
      body = content;
      const rec = await this.requestJson<{ message_id?: string; status?: string }>(
        'POST',
        `/api/v1/instances/${encodeURIComponent(this.instanceId)}/messages`,
        {
          type: 'text',
          to: destino.jid ? { jid: destino.jid } : { phone: destino.phone },
          text: { body: content },
        },
        idem
      );
      messageId = rec.message_id || '';
    } else {
      mimetype = content.mimetype || 'application/octet-stream';
      filename = content.filename || `arquivo${extFromMime(mimetype)}`;
      dataB64 = content.data || '';
      body = options?.caption || '';
      hasMedia = true;
      wwebType = tipoDeMidia(mimetype, 'document');
      const bytes = Buffer.from(dataB64, 'base64');
      const rec = await this.postMedia(destino, body, bytes, filename, mimetype, idem);
      messageId = rec.message_id || '';
    }

    if (!messageId) {
      throw new Error('SyncZap aceitou o envio sem message_id');
    }

    const msg = this.buildMessage({
      waMessageId: messageId,
      peer: toWwebId(chatId),
      fromMe: true,
      body,
      wwebType,
      hasMedia,
      timestamp: Math.floor(Date.now() / 1000),
      displayName: '',
      knownMedia: hasMedia ? { mimetype, data: dataB64, filename } : undefined,
    });
    // O eco origin=api do stream é ignorado. O message_create local é o que o
    // whatsapp-web.js dispara ao enviar, e é o que grava a mensagem de saída.
    this.emit('message_create', msg);
    return msg;
  }

  private assertConfig(): void {
    if (!this.baseUrl || !this.apiKey || !this.instanceId) {
      throw new Error('SYNCZ_BASE_URL, SYNCZ_API_KEY e SYNCZ_INSTANCE_ID são obrigatórios quando WHATSAPP_PROVIDER=synczap');
    }
  }

  private rememberIdentity(phone: string | undefined, name: string | undefined): void {
    const digits = (phone || '').replace(/\D/g, '');
    const user = digits || (this.info?.wid.user || '');
    if (!user && !name) return;
    this.info = {
      wid: {
        user,
        _serialized: user ? `${user}@c.us` : '',
      },
      pushname: name || this.info?.pushname || '',
      platform: 'synczap',
    };
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'X-Contract-Version': CONTRACT_VERSION,
      ...(extra || {}),
    };
  }

  private async requestJson<T>(method: string, urlPath: string, body?: unknown, idemKey?: string): Promise<T> {
    const extra: Record<string, string> = {};
    if (body !== undefined) extra['Content-Type'] = 'application/json';
    if (idemKey) extra['Idempotency-Key'] = idemKey;
    let res: Response;
    try {
      res = await fetch(this.baseUrl + urlPath, {
        method,
        headers: this.headers(extra),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error: any) {
      throw new Error(`SyncZap rede ${method} ${urlPath}: ${error.message}`);
    }
    if (res.status >= 400) {
      const detail = await detalhe(res);
      throw new Error(`SyncZap HTTP ${res.status} ${method} ${urlPath}: ${detail}`);
    }
    if (res.status === 204) return {} as T;
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async postMedia(destino: Destino, caption: string, bytes: Buffer, filename: string, mimetype: string, idemKey: string): Promise<{ message_id?: string; status?: string }> {
    const boundary = `SyncZap${crypto.randomUUID().replace(/-/g, '')}`;
    const parts: Buffer[] = [];
    const field = (name: string, value: string) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    };
    if (destino.jid) field('to_jid', destino.jid);
    else field('to_phone', destino.phone || '');
    if (caption) field('caption', caption);
    const safeName = filename.replace(/["\r\n]/g, '_');
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${mimetype}\r\n\r\n`
    ));
    parts.push(bytes);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const payload = Buffer.concat(parts);

    let res: Response;
    try {
      res = await fetch(this.baseUrl + `/api/v1/instances/${encodeURIComponent(this.instanceId)}/messages`, {
        method: 'POST',
        headers: this.headers({
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Idempotency-Key': idemKey,
        }),
        body: new Uint8Array(payload),
      });
    } catch (error: any) {
      throw new Error(`SyncZap rede POST media: ${error.message}`);
    }
    if (res.status >= 400) {
      const detail = await detalhe(res);
      throw new Error(`SyncZap HTTP ${res.status} POST media: ${detail}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  private startLoop(): void {
    if (this.loop) return;
    this.loop = this.runLoop().finally(() => {
      this.loop = null;
    });
  }

  private stopStream(): void {
    this.stopping = true;
    this.streamAbort?.abort();
    this.streamAbort = null;
    if (this.wake) this.wake();
    for (const waiters of this.mediaWaiters.values()) {
      for (const w of waiters) w.reject(new Error('SyncZap stream fechado'));
    }
    this.mediaWaiters.clear();
  }

  private async runLoop(): Promise<void> {
    let delay = 1000;
    while (!this.stopping) {
      let ok = false;
      try {
        await this.openStreamOnce();
        ok = true;
      } catch (error: any) {
        if (this.stopping || error?.name === 'AbortError') return;
        logger.warn(`SyncZap stream caiu, reconectando: ${error.message}`);
      }
      if (!this.stopping) this.flushBatch();
      if (this.stopping) return;
      await this.sleep(delay);
      delay = ok ? 1000 : Math.min(delay * 2, 30_000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  private async openStreamOnce(): Promise<void> {
    this.assertConfig();
    const q = new URLSearchParams();
    q.set('instance_id', this.instanceId);
    if (this.lastSeq > 0) q.set('from_seq', String(this.lastSeq));
    const ctrl = new AbortController();
    this.streamAbort = ctrl;
    const res = await fetch(`${this.baseUrl}/api/v1/events/stream?${q.toString()}`, {
      method: 'GET',
      headers: this.headers(),
      signal: ctrl.signal,
    });
    if (res.status >= 400) {
      const detail = await detalhe(res);
      throw new Error(`SyncZap HTTP ${res.status} GET stream: ${detail}`);
    }
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (!this.stopping) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      buf = this.consumeSse(buf, false);
    }
    buf += decoder.decode();
    this.consumeSse(buf, true);
  }

  private consumeSse(buffer: string, flush: boolean): string {
    const lines = buffer.split('\n');
    const rest = flush ? '' : (lines.pop() ?? '');
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '');
      if (line === '') {
        this.dispatchBlock();
        continue;
      }
      if (line.startsWith(':') || line.startsWith('event:')) continue;
      if (line.startsWith('id:')) this.sseId = line.slice(3).trim();
      else if (line.startsWith('data:')) this.sseData.push(line.slice(5).replace(/^ /, ''));
    }
    if (flush) this.dispatchBlock();
    return rest;
  }

  private dispatchBlock(): void {
    const data = this.sseData.join('\n');
    const idLine = this.sseId;
    this.sseId = '';
    this.sseData = [];
    if (!data.trim()) return;
    let envelope: Envelope;
    try {
      envelope = JSON.parse(data) as Envelope;
    } catch (error: any) {
      logger.warn(`SyncZap evento SSE inválido: ${error.message}`);
      return;
    }
    if ((envelope.seq === undefined || envelope.seq === null) && idLine) {
      const n = Number(idLine);
      if (!Number.isNaN(n)) envelope.seq = n;
    }
    this.handleEnvelope(envelope);
  }

  private handleEnvelope(ev: Envelope): void {
    const seq = typeof ev.seq === 'number' ? ev.seq : 0;
    const evId = ev.id || `${ev.type}:${seq}`;
    if (seq > 0 && seq < this.lastSeq) return;
    if (seq > 0 && seq === this.lastSeq && this.idsNoSeq.has(evId)) return;
    const tipo = ev.type || '';
    if (tipo === 'message.received') {
      this.onMessage(ev);
    } else if (tipo === 'media.ready' || tipo === 'media.failed') {
      this.onMedia(tipo, asObject(ev.payload));
    } else if (this.isRecent(ev.occurred_at)) {
      this.noteControl(tipo, asObject(ev.payload));
    }
    if (seq > 0) this.persistSeq(seq, evId);
  }

  private noteControl(tipo: string, payload: Record<string, any>): void {
    if (tipo === 'instance.status_changed') {
      this.batchToState = String(payload.to_state || '');
      this.batchReason = String(payload.reason || '');
    } else if (tipo === 'instance.connected') {
      this.batchToState = 'connected';
      this.batchReason = '';
    } else if (tipo === 'instance.paired') {
      this.batchToState = 'paired';
      this.batchReason = '';
      if (payload.phone) this.rememberIdentity(String(payload.phone), undefined);
    } else if (tipo === 'instance.pairing_qr' && payload.qr_code) {
      this.batchQr = String(payload.qr_code);
    } else if (tipo === 'instance.pairing_failed') {
      this.batchAuthFailure = String(payload.error || 'pairing_failed');
    }
  }

  private flushBatch(): void {
    const toState = this.batchToState;
    const reason = this.batchReason;
    const qr = this.batchQr;
    const failure = this.batchAuthFailure;
    this.batchToState = null;
    this.batchReason = '';
    this.batchQr = null;
    this.batchAuthFailure = null;
    if (toState) this.applyRemoteState(toState, reason);
    if (failure && this.waState !== 'CONNECTED') this.emit('auth_failure', failure);
    if (qr && this.waState === 'UNPAIRED') this.emit('qr', qr);
  }

  private applyRemoteState(toState: string, reason: string): void {
    if (toState === 'connected') {
      this.waState = 'CONNECTED';
      this.emit('change_state', 'CONNECTED');
      this.emit('authenticated');
      this.emit('ready');
      return;
    }
    if (toState === 'paired' || toState === 'warming' || toState === 'reconnecting' || toState === 'awaiting_consent') {
      this.waState = 'OPENING';
      this.emit('change_state', 'OPENING');
      if (toState === 'paired') this.emit('authenticated');
      return;
    }
    if (toState === 'disconnected' || toState === 'logged_out' || toState === 'failed' || toState === 'banned' || toState === 'revoked') {
      this.waState = 'UNPAIRED';
      this.emit('change_state', 'UNPAIRED');
      if (!this.stopping) {
        this.emit('disconnected', toState === 'logged_out' ? 'LOGOUT' : (reason || toState));
      }
      return;
    }
    this.waState = 'UNPAIRED';
    this.emit('change_state', 'UNPAIRED');
  }

  private onMessage(ev: Envelope): void {
    const payload = asObject(ev.payload);
    if (payload.is_group === true) return;
    const origin = String(payload.origin || 'inbound');
    if (origin === 'api') return;
    const from = asObject(payload.from);
    const contact = asObject(payload.contact);
    const phoneJid = String(from.phone_jid || contact.phone_jid || '');
    const lidJid = String(from.lid_jid || contact.lid_jid || '');
    const peerRaw = phoneJid || lidJid || ev.chat_jid || '';
    if (!peerRaw || peerRaw.endsWith('@g.us')) return;
    const peer = toWwebId(peerRaw);
    const displayName = String(from.display_name || contact.display_name || '');
    const media = payload.media ? asObject(payload.media) : undefined;
    const kind = String(payload.type || 'text');
    const mime = media ? String(media.mimetype || '') : '';
    const wwebType = kind === 'text' ? 'chat' : tipoPorKind(kind, mime);
    const hasMedia = !!media || ['image', 'audio', 'ptt', 'video', 'document', 'sticker'].includes(wwebType);
    const received = payload.received_at ? Date.parse(String(payload.received_at)) : NaN;
    const timestamp = Number.isNaN(received) ? Math.floor(Date.now() / 1000) : Math.floor(received / 1000);
    const fromMe = origin === 'device';
    const msg = this.buildMessage({
      waMessageId: String(payload.wa_message_id || ''),
      peer,
      fromMe,
      body: String(payload.text || ''),
      wwebType,
      hasMedia,
      timestamp,
      displayName,
    });
    if (fromMe) {
      this.emit('message_create', msg);
    } else {
      this.emit('message', msg);
      this.emit('message_create', msg);
    }
  }

  private buildMessage(input: {
    waMessageId: string;
    peer: string;
    fromMe: boolean;
    body: string;
    wwebType: string;
    hasMedia: boolean;
    timestamp: number;
    displayName: string;
    knownMedia?: MediaDownload;
  }): any {
    const self = this;
    const number = input.peer.replace(/@.*/, '').replace(/\D/g, '');
    const msg: any = {
      id: { _serialized: input.waMessageId, id: input.waMessageId, fromMe: input.fromMe, remote: input.peer },
      from: input.peer,
      to: input.fromMe ? input.peer : input.peer,
      body: input.body,
      type: input.wwebType,
      hasMedia: input.hasMedia,
      timestamp: input.timestamp,
      fromMe: input.fromMe,
      isStatus: false,
      hasReaction: false,
      hasQuotedMsg: false,
      vCards: [],
      location: undefined,
      _data: {
        notifyName: input.displayName,
        caption: input.hasMedia ? input.body : undefined,
        type: input.wwebType,
      },
      downloadMedia: async (): Promise<MediaDownload> => {
        if (input.knownMedia) return input.knownMedia;
        const ready = await self.waitMedia(input.waMessageId);
        self.mediaReady.delete(input.waMessageId);
        return self.baixarMidia(ready);
      },
      getChat: async () => ({
        id: { _serialized: input.peer },
        name: input.displayName,
        isGroup: false,
      }),
      getContact: async () => ({
        pushname: input.displayName,
        number,
      }),
    };
    return msg;
  }

  private onMedia(tipo: string, payload: Record<string, any>): void {
    const waId = String(payload.wa_message_id || '');
    if (!waId) return;
    if (tipo === 'media.failed') {
      const reason = String(payload.reason || 'media.failed');
      this.mediaFailed.set(waId, reason);
      const waiters = this.mediaWaiters.get(waId) || [];
      this.mediaWaiters.delete(waId);
      for (const w of waiters) w.reject(new Error(reason));
      return;
    }
    const ready: MediaPronta = {
      url: String(payload.url || ''),
      mimetype: String(payload.mimetype || 'application/octet-stream'),
      filename: `media${extFromMime(String(payload.mimetype || ''))}`,
    };
    this.mediaReady.set(waId, ready);
    const waiters = this.mediaWaiters.get(waId) || [];
    this.mediaWaiters.delete(waId);
    for (const w of waiters) w.resolve(ready);
  }

  private waitMedia(waId: string): Promise<MediaPronta> {
    const ready = this.mediaReady.get(waId);
    if (ready) return Promise.resolve(ready);
    const failed = this.mediaFailed.get(waId);
    if (failed) return Promise.reject(new Error(failed));
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const entry = {
        resolve: (m: MediaPronta) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      timer = setTimeout(() => {
        const list = this.mediaWaiters.get(waId) || [];
        this.mediaWaiters.set(waId, list.filter((w) => w !== entry));
        entry.reject(new Error('timeout aguardando media.ready'));
      }, MEDIA_WAIT_MS);
      const list = this.mediaWaiters.get(waId) || [];
      list.push(entry);
      this.mediaWaiters.set(waId, list);
    });
  }

  private async baixarMidia(ready: MediaPronta): Promise<MediaDownload> {
    const url = this.urlDaMidia(ready.url);
    const res = await fetch(url, { method: 'GET', headers: this.headers() });
    if (res.status >= 400) {
      const detail = await detalhe(res);
      throw new Error(`SyncZap HTTP ${res.status} GET media: ${detail}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mimetype = ready.mimetype || (res.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
    return {
      mimetype,
      data: buf.toString('base64'),
      filename: ready.filename || `media${extFromMime(mimetype)}`,
    };
  }

  private urlDaMidia(urlMidia: string): string {
    if (urlMidia.startsWith('/') && !urlMidia.startsWith('//')) return this.baseUrl + urlMidia;
    let alvo: URL;
    let base: URL;
    try {
      alvo = new URL(urlMidia);
      base = new URL(this.baseUrl);
    } catch {
      throw new Error('url de midia invalida');
    }
    if (alvo.protocol !== base.protocol || alvo.host !== base.host) {
      throw new Error('url de midia fora do gateway configurado');
    }
    return urlMidia;
  }

  private isRecent(occurredAt: string | undefined): boolean {
    if (!occurredAt) return true;
    const t = Date.parse(occurredAt);
    if (Number.isNaN(t)) return true;
    return Date.now() - t <= STATUS_EVENT_MAX_AGE_MS;
  }

  private readSeq(): number {
    try {
      const raw = fs.readFileSync(SEQ_FILE, 'utf8');
      const parsed = JSON.parse(raw) as SeqFile;
      if (parsed.instance_id && parsed.instance_id !== this.instanceId) return 0;
      const seq = Number(parsed.seq || 0);
      if (seq > 0 && Array.isArray(parsed.ids)) this.idsNoSeq = new Set(parsed.ids);
      return seq > 0 ? seq : 0;
    } catch {
      return 0;
    }
  }

  private persistSeq(seq: number, evId: string): void {
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
      this.idsNoSeq = new Set();
    }
    this.idsNoSeq.add(evId);
    try {
      fs.mkdirSync(path.dirname(SEQ_FILE), { recursive: true });
      fs.writeFileSync(SEQ_FILE, JSON.stringify({ instance_id: this.instanceId, seq: this.lastSeq, ids: [...this.idsNoSeq] }));
    } catch (error: any) {
      logger.warn(`SyncZap não gravou o cursor de eventos: ${error.message}`);
    }
  }
}

function asObject(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (value && typeof value === 'object') return value as Record<string, any>;
  return {};
}

function toWwebId(jid: string): string {
  if (!jid) return '';
  if (jid.endsWith('@s.whatsapp.net')) return jid.replace('@s.whatsapp.net', '@c.us');
  if (jid.endsWith('@lid') || jid.endsWith('@c.us') || jid.endsWith('@g.us')) return jid;
  if (jid.includes('@')) return jid;
  return `${jid.replace(/\D/g, '')}@c.us`;
}

function destinoDe(chatId: string): Destino {
  if (chatId.includes('@lid')) {
    return { jid: chatId.endsWith('@lid') ? chatId : `${chatId}@lid` };
  }
  if (chatId.endsWith('@c.us')) {
    return { phone: chatId.replace('@c.us', '').replace(/\D/g, '') };
  }
  if (chatId.includes('@')) return { jid: chatId };
  return { phone: chatId.replace(/\D/g, '') };
}

function tipoPorKind(kind: string, mime: string): string {
  const k = kind.toLowerCase();
  if (k === 'ptt') return 'ptt';
  if (k === 'audio') return /ogg|opus/i.test(mime) ? 'ptt' : 'audio';
  if (k === 'image' || k === 'video' || k === 'document' || k === 'sticker') return k;
  if (k === 'location') return 'location';
  if (k === 'contact' || k === 'vcard') return 'vcard';
  if (k === 'text' || k === 'chat') return 'chat';
  return tipoDeMidia(mime, 'chat');
}

function tipoDeMidia(mime: string, fallback: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  if (!base) return fallback;
  if (base.startsWith('image/')) return 'image';
  if (base.startsWith('video/')) return 'video';
  if (base.startsWith('audio/')) return /ogg|opus/.test(base) ? 'ptt' : 'audio';
  if (base.startsWith('application/') || base.startsWith('text/')) return 'document';
  return fallback;
}

function extFromMime(mime: string): string {
  const base = (mime || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'application/pdf': '.pdf',
  };
  return map[base] || '';
}

async function detalhe(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = String(parsed.detail || parsed.title || text);
  } catch {
    detail = text;
  }
  return detail.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300);
}
