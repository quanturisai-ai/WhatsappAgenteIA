// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/simulate-incoming.test.ts
// Endpoint de teste de ponta a ponta: desligado por padrão e só para números de teste.
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationModel } from '../src/models/conversation.model';
import { ConversationService } from '../src/services/conversation.service';
import { WhatsAppManager } from '../src/services/whatsapp.manager';
import { simulateIncomingForTest } from '../src/controllers/conversation.controller';

const conversas: Record<number, any> = {
  7: { id: 7, user_id: 1, contact_number: '5561900000001' },
  50: { id: 50, user_id: 1, contact_number: '5562900000002' },
  60: { id: 60, user_id: 2, contact_number: '5561900000001' },
};
(ConversationModel.prototype as any).findById = async (id: number) => conversas[id] || null;
const turnos: any[] = [];
(ConversationService.prototype as any).processIncomingMessage = async (...args: any[]) => { turnos.push(args); };
(WhatsAppManager as any).getInstance = () => ({ getServiceSync: () => ({ fake: true }) });

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
