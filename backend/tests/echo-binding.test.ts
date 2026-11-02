// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/echo-binding.test.ts
// Item 0 (02/11/2026): a resposta da IA era gravada na conversa errada quando o eco @lid
// era resolvido pelo contato e existia outra conversa com contact_number = dígitos do LID.
// Sem rede e sem banco: gateway SyncZap falso e modelos em memória.
process.env.WHATSAPP_PROVIDER = 'synczap';
process.env.SYNCZ_BASE_URL = 'http://synczap.invalid';
process.env.SYNCZ_API_KEY = 'chave-de-teste';
process.env.SYNCZ_INSTANCE_ID = 'instancia-teste';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

let nextWaId = 1;
let client: any;

// Gateway falso: POST /messages devolve um message_id e já registra o message.sent.
(globalThis as any).fetch = async (url: string, init?: { method?: string }) => {
  if (url.endsWith('/messages') && init?.method === 'POST') {
    const id = `wamid-${nextWaId++}`;
    client.onDesfecho('message.sent', { message_id: id });
    return new Response(JSON.stringify({ message_id: id, status: 'queued' }), { status: 202 });
  }
  return new Response(JSON.stringify({ results: [] }), { status: 200 });
};

import { SyncZapClient } from '../src/services/synczap.client';
import { WhatsAppService } from '../src/services/whatsapp.service';

const LID = '155000000054353@lid';
const FONE = '5561900000001';      // número de teste do dono
const FONE_CLIENTE = '5562900000002';
const LID_CLIENTE = '177000000011111@lid';

function criarBanco() {
  const conversas: any[] = [
    // Conversa verdadeira: telefone + LID (como a conversa 8 em produção)
    { id: 8, user_id: 1, contact_number: FONE, lid: LID, auto_responding: 1, status: 'in_progress', handler: 'ai' },
    // Duplicata antiga: contact_number = dígitos do LID (como a conversa 624)
    { id: 624, user_id: 1, contact_number: LID.replace('@lid', ''), lid: LID, auto_responding: 1, status: 'finished', handler: 'ai' },
    // Cliente comum fora da lista de teste, também com duplicata
    { id: 50, user_id: 1, contact_number: FONE_CLIENTE, lid: LID_CLIENTE, auto_responding: 1, status: 'in_progress', handler: 'ai' },
    { id: 51, user_id: 1, contact_number: LID_CLIENTE.replace('@lid', ''), lid: LID_CLIENTE, auto_responding: 1, status: 'finished', handler: 'ai' },
  ];
  const mensagens: any[] = [];
  const conversationModel = {
    findByUserAndContact: async (_u: number, n: string) => conversas.find((c) => c.contact_number === n) || null,
    findByLid: async (_u: number, l: string) => conversas.find((c) => c.lid === l) || null,
    findByUserOrLid: async (u: number, n: string, l?: string | null) =>
      (await conversationModel.findByUserAndContact(u, n)) || (l ? await conversationModel.findByLid(u, l) : null),
    findById: async (id: number) => conversas.find((c) => c.id === id) || null,
    update: async (id: number, upd: any) => { Object.assign(conversas.find((c) => c.id === id) || {}, upd); return true; },
    create: async (c: any) => { const n = { id: 900 + conversas.length, ...c }; conversas.push(n); return n; },
    getConversationCardById: async () => null,
  };
  const messageModel = {
    create: async (m: any) => { const n = { id: mensagens.length + 1, created_at: new Date(), ...m }; mensagens.push(n); return n; },
    findByMessageId: async (id: string) => mensagens.find((m) => m.message_id === id) || null,
    findByConversationId: async (cid: number) => mensagens.filter((m) => m.conversation_id === cid).slice(-10),
    update: async (id: number, upd: any) => { Object.assign(mensagens.find((m) => m.id === id) || {}, upd); return true; },
    countByConversation: async (cid: number) => mensagens.filter((m) => m.conversation_id === cid).length,
  };
  return { conversas, mensagens, conversationModel, messageModel };
}

function criarServico() {
  const banco = criarBanco();
  const svc: any = new WhatsAppService(1);
  svc.conversationModel = banco.conversationModel;
  svc.messageModel = banco.messageModel;
  svc.agentConfigModel = { findByUserId: async () => ({ pause_on_human_reply: 1 }) };
  svc.reactionModel = {};
  svc.sessionModel = new Proxy({}, { get: () => async () => ({}) });
  client = new SyncZapClient();
  svc.client = client;
  svc.isReady = () => true;
  svc.setupEvents();
  return { svc, banco };
}

const esperar = (ms = 50) => new Promise((r) => setTimeout(r, ms));

function arquivoTemp(): string {
  const p = path.join(os.tmpdir(), `eco-teste-${process.pid}.jpg`);
  fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return p;
}

test('item 0: resposta da IA para contato com LID fica na conversa da IA, não na duplicata', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  await svc.sendMessage(FONE, 'Boa noite! Temos promoção.', true, false, LID, 'ai', { conversationId: 8 });
  await esperar();
  assert.equal(banco.mensagens.length, 1);
  assert.equal(banco.mensagens[0].conversation_id, 8, 'deveria gravar na conversa 8 (a que a IA respondeu)');
  assert.equal(banco.mensagens[0].source, 'ai');
  assert.equal(banco.mensagens[0].is_from_ai, true);
  assert.equal(banco.conversas.find((c) => c.id === 8).auto_responding, 1, 'IA não pode ser pausada');
});

test('item 0: mídia da IA sem legenda mantém source=ai e não pausa a IA', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  await svc.sendMedia(FONE, arquivoTemp(), undefined, true, 77, 0, LID, 'ai', { conversationId: 8 });
  await esperar();
  assert.equal(banco.mensagens.length, 1);
  const m = banco.mensagens[0];
  assert.equal(m.conversation_id, 8);
  assert.equal(m.source, 'ai', 'mídia sem legenda enviada pela IA não pode virar "human"');
  assert.equal(m.media_id, 77);
  assert.equal(banco.conversas.find((c) => c.id === 8).auto_responding, 1, 'IA não pode ser pausada');
});

test('item 0: mídia da IA com legenda vai para a conversa certa', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  await svc.sendMedia(FONE, arquivoTemp(), 'Veja nossa tabela', true, 12, 0, LID, 'ai', { conversationId: 8 });
  await esperar();
  assert.equal(banco.mensagens[0].conversation_id, 8);
  assert.equal(banco.mensagens[0].source, 'ai');
  assert.equal(banco.mensagens[0].media_id, 12);
});

test('item 0: eco repetido não duplica a mensagem (gravação idempotente)', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  const msg = await svc.sendMessage(FONE, 'Olá!', true, false, LID, 'ai', { conversationId: 8 });
  await esperar();
  client.emit('message_create', msg);
  client.emit('message_create', msg);
  await esperar();
  assert.equal(banco.mensagens.length, 1);
  assert.equal(banco.mensagens[0].conversation_id, 8);
});

test('item 0: duas conversas com o mesmo texto ao mesmo tempo não se misturam', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  await Promise.all([
    svc.sendMessage(FONE, 'Bom dia!', true, false, LID, 'ai', { conversationId: 8 }),
    svc.sendMessage(FONE_CLIENTE, 'Bom dia!', true, false, LID_CLIENTE, 'ai', { conversationId: 50 }),
  ]);
  await esperar();
  const conv = banco.mensagens.map((m) => m.conversation_id).sort((a, b) => a - b);
  assert.deepEqual(conv, [8, 50]);
});

test('item 0: mensagem humana do painel continua pausando a IA (comportamento mantido)', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  await svc.sendMessage(FONE, 'Oi, aqui é a atendente', false, false, LID, 'human', { conversationId: 8 });
  await esperar();
  assert.equal(banco.mensagens[0].conversation_id, 8);
  assert.equal(banco.mensagens[0].source, 'human');
  assert.equal(banco.conversas.find((c) => c.id === 8).auto_responding, false);
});

test('flag: OUTGOING_ECHO_BINDING=off mantém o comportamento antigo', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'off';
  const { svc, banco } = criarServico();
  await svc.sendMessage(FONE, 'Resposta antiga', true, false, LID, 'ai', { conversationId: 8 });
  await esperar();
  assert.equal(banco.mensagens[0].conversation_id, 624, 'off = caminho antigo (resolve pelo contato)');
});

test('flag: OUTGOING_ECHO_BINDING=test só vale para AGENTE_TEST_NUMBERS', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'test';
  const { svc, banco } = criarServico();
  await svc.sendMessage(FONE, 'Para o dono', true, false, LID, 'ai', { conversationId: 8 });
  await svc.sendMessage(FONE_CLIENTE, 'Para o cliente', true, false, LID_CLIENTE, 'ai', { conversationId: 50 });
  await esperar();
  const porTexto = Object.fromEntries(banco.mensagens.map((m) => [m.content, m.conversation_id]));
  assert.equal(porTexto['Para o dono'], 8);
  assert.equal(porTexto['Para o cliente'], 51, 'cliente fora da lista segue no caminho antigo');
});

test('mensagem enviada do celular (sem registro) segue o caminho antigo como humana', async () => {
  process.env.OUTGOING_ECHO_BINDING = 'on';
  const { svc, banco } = criarServico();
  // origin=device chega pelo stream com o telefone (phone_jid)
  client.onMessage({ payload: { origin: 'device', from: { phone_jid: `${FONE}@s.whatsapp.net` }, text: 'digitado no celular', wa_message_id: 'dev-1' } });
  await esperar();
  assert.equal(banco.mensagens[0].conversation_id, 8);
  assert.equal(banco.mensagens[0].source, 'human');
});
