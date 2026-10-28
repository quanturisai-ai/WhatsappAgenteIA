// Roda com: npx ts-node --transpile-only tests/synczap-ready.test.ts
// (ou: node --test-force-exit -r ts-node/register/transpile-only tests/synczap-ready.test.ts)
// Sem rede: o fetch global é substituído por um gateway SyncZap falso.
process.env.WHATSAPP_PROVIDER = 'synczap';
process.env.SYNCZ_BASE_URL = 'http://synczap.invalid';
process.env.SYNCZ_API_KEY = 'chave-de-teste';
process.env.SYNCZ_INSTANCE_ID = 'instancia-teste';

import test from 'node:test';
import assert from 'node:assert/strict';

let instanceStatus = 'connected';

// Gateway falso: GET da instância devolve o status atual; o stream de eventos fica aberto até abortar.
(globalThis as any).fetch = async (url: string, init?: { signal?: AbortSignal }) => {
  if (url.includes('/events/stream')) {
    const body = new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener('abort', () => {
          try { controller.error(Object.assign(new Error('abort'), { name: 'AbortError' })); } catch { /* já fechado */ }
        });
      },
    });
    return new Response(body, { status: 200 });
  }
  return new Response(JSON.stringify({ status: instanceStatus, phone: '5511999999999', name: 'Teste' }), { status: 200 });
};

import { SyncZapClient } from '../src/services/synczap.client';
import { WhatsAppService } from '../src/services/whatsapp.service';

const semBanco: any = new Proxy({}, { get: () => async () => ({}) });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function criarServico() {
  const svc: any = new WhatsAppService(1);
  for (const m of ['sessionModel', 'conversationModel', 'messageModel', 'reactionModel', 'agentConfigModel']) svc[m] = semBanco;
  const client = new SyncZapClient();
  svc.client = client;
  svc.setupEvents();
  return { svc, client };
}

test('SyncZap: após queda e reconexão pelo stream, isReady() volta a true', async () => {
  const { svc, client } = criarServico();
  try {
    // Sessão que estava pronta e depois caiu (evento 'disconnected' zera as flags do serviço).
    await client.initialize();
    svc.isInitialized = true;
    svc.isClientReady = true;
    assert.equal(svc.isReady(), true);
    (client as any).applyRemoteState('disconnected', 'connection_lost');
    assert.equal(svc.isReady(), false);

    // O gateway volta a ficar connected: o laço de eventos reemite authenticated/ready,
    // sem passar por initialize() do serviço (como nos logs de 14:05 e 16:26).
    (client as any).applyRemoteState('connected', '');
    await esperar(6500); // handler de 'ready' espera 5s de sincronização

    assert.equal(svc.isReady(), true, 'isReady() deveria refletir a conexão real do SyncZap');
  } finally {
    await client.destroy();
    svc.stopKeepAlive();
  }
});

test('SyncZap: isReady() é false quando o laço de eventos foi encerrado', async () => {
  const { svc, client } = criarServico();
  svc.isInitialized = true;
  svc.isClientReady = true;
  await client.initialize();
  assert.equal(svc.isReady(), true);
  await client.destroy();
  assert.equal(svc.isReady(), false);
  svc.stopKeepAlive();
});
