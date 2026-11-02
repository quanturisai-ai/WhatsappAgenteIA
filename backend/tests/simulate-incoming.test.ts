// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/simulate-incoming.test.ts
// Endpoint de teste de ponta a ponta: desligado por padrão e só para números de teste.
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationModel } from '../src/models/conversation.model';
import { ConversationService } from '../src/services/conversation.service';
import { WhatsAppManager } from '../src/services/whatsapp.manager';
import { simulateIncomingForTest, simulateIncomingMediaForTest } from '../src/controllers/conversation.controller';
import { MessageModel } from '../src/models/message.model';

const conversas: Record<number, any> = {
  7: { id: 7, user_id: 1, contact_number: '5561900000001' },
  50: { id: 50, user_id: 1, contact_number: '5562900000002' },
  60: { id: 60, user_id: 2, contact_number: '5561900000001' },
};
(ConversationModel.prototype as any).findById = async (id: number) => conversas[id] || null;
const turnos: any[] = [];
(ConversationService.prototype as any).processIncomingMessage = async (...args: any[]) => { turnos.push(args); };
const fila: any[] = [];
const midiasSalvas: any[] = [];
const criadas: any[] = [];
(MessageModel.prototype as any).create = async (m: any) => { criadas.push(m); return { id: 900 + criadas.length, ...m }; };
(WhatsAppManager as any).getInstance = () => ({
  getServiceSync: () => ({
    fake: true,
    saveIncomingMedia: async (buf: Buffer, mime: string) => { midiasSalvas.push({ bytes: buf.length, mime }); return 77; },
    turnScheduler: { enqueue: (conv: number, item: any) => fila.push({ conv, item }) },
  }),
});

async function chamar(id: number) {
  let status = 200;
  let body: any = null;
  const res: any = { status: (s: number) => { status = s; return res; }, json: (b: any) => { body = b; return res; } };
  await simulateIncomingForTest({ userId: 1, params: { id: String(id) }, body: { content: 'teste' } } as any, res, (e: any) => { throw e; });
  return { status, body };
}

test('desligado (padrão): 404 e nenhum turno', async () => {
  delete process.env.AGENTE_TEST_ENDPOINT;
  turnos.length = 0;
  assert.equal((await chamar(7)).status, 404);
  assert.equal(turnos.length, 0);
});

test('ligado: conversa de cliente comum é recusada (403)', async () => {
  process.env.AGENTE_TEST_ENDPOINT = 'on';
  turnos.length = 0;
  assert.equal((await chamar(50)).status, 403);
  assert.equal(turnos.length, 0);
});

test('ligado: conversa de outro usuário não é encontrada (404)', async () => {
  process.env.AGENTE_TEST_ENDPOINT = 'on';
  turnos.length = 0;
  assert.equal((await chamar(60)).status, 404);
  assert.equal(turnos.length, 0);
});

test('ligado: número de teste roda o turno', async () => {
  process.env.AGENTE_TEST_ENDPOINT = 'on';
  turnos.length = 0;
  const r = await chamar(7);
  assert.equal(r.status, 200);
  assert.equal(turnos.length, 1);
  assert.deepEqual(turnos[0].slice(0, 3), [1, 7, 'teste']);
});

// ---------------------------------------------------------------- item 5: mídia de teste

async function chamarMidia(id: number, headers: Record<string, string> = { 'x-mimetype': 'image/jpeg' }, body: any = Buffer.from([1, 2, 3])) {
  let status = 200;
  let resp: any = null;
  const res: any = { status: (s: number) => { status = s; return res; }, json: (b: any) => { resp = b; return res; } };
  await simulateIncomingMediaForTest({ userId: 1, params: { id: String(id) }, headers, body } as any, res, (e: any) => { throw e; });
  return { status, body: resp };
}

test('mídia de teste: desligado = 404; cliente comum = 403; tipo inválido = 400; nada gravado', async () => {
  process.env.TURN_SCHEDULER = 'on';
  fila.length = 0; midiasSalvas.length = 0; criadas.length = 0;
  delete process.env.AGENTE_TEST_ENDPOINT;
  assert.equal((await chamarMidia(7)).status, 404);
  process.env.AGENTE_TEST_ENDPOINT = 'on';
  assert.equal((await chamarMidia(50)).status, 403);
  assert.equal((await chamarMidia(7, { 'x-mimetype': 'application/pdf' })).status, 400);
  assert.equal((await chamarMidia(7, { 'x-mimetype': 'image/jpeg' }, {})).status, 400);
  assert.equal(fila.length + midiasSalvas.length + criadas.length, 0);
});

test('mídia de teste: número de teste grava a mídia como recebida e põe na fila do agendador', async () => {
  process.env.TURN_SCHEDULER = 'on';
  process.env.AGENTE_TEST_ENDPOINT = 'on';
  process.env.AGENTE_MULTIMODAL = 'off';
  fila.length = 0; midiasSalvas.length = 0; criadas.length = 0;
  const r = await chamarMidia(7, { 'x-mimetype': 'image/jpeg', 'x-legenda': encodeURIComponent('deu erro na secadora') });
  assert.equal(r.status, 200);
  assert.deepEqual(midiasSalvas, [{ bytes: 3, mime: 'image/jpeg' }]);
  assert.equal(criadas[0].message_type, 'media');
  assert.equal(criadas[0].media_id, 77);
  assert.equal(criadas[0].direction, 'incoming');
  assert.equal(criadas[0].content, 'deu erro na secadora');
  assert.equal(fila.length, 1);
  assert.equal(fila[0].item.dbId, r.body.messageDbId);
});
