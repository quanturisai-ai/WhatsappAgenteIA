// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/turn-metrics.test.ts
// Item 1: uma linha JSON por turno (TURN_METRICS=on) com tokens, cache, custo, ms e modelo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ARQ = path.join(os.tmpdir(), `turnos-teste-${process.pid}.jsonl`);
process.env.TURN_METRICS_FILE = ARQ;

import { ConversationService } from '../src/services/conversation.service';
import { OpenRouterService } from '../src/services/openrouter.service';

function linhas(): any[] {
  if (!fs.existsSync(ARQ)) return [];
  return fs.readFileSync(ARQ, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function criar(opcoes: { falharLlm?: boolean; pausado?: boolean } = {}) {
  const corpos: any[] = [];
  const openrouter: any = new OpenRouterService();
  openrouter.axiosInstance = {
    post: async (url: string, body: any) => {
      corpos.push({ url, body });
      await new Promise((r) => setTimeout(r, 15));
      if (url === '/embeddings') {
        return { data: { model: 'emb-x', data: [{ embedding: [0.1, 0.2] }], usage: { prompt_tokens: 12, total_tokens: 12, cost: 0.000001 } } };
      }
      if (opcoes.falharLlm) throw new Error('timeout');
      return {
        data: {
          model: 'deepseek/deepseek-v4-flash',
          provider: 'Wafer',
          choices: [{ message: { content: 'Olá! Como posso ajudar?' } }],
          usage: { prompt_tokens: 4400, completion_tokens: 30, cost: 0.0004, prompt_tokens_details: { cached_tokens: 4096 } },
        },
      };
    },
  };
  const svc: any = new ConversationService();
  svc.conversationModel = {
    findById: async (id: number) => ({ id, user_id: 1, contact_number: '5562944440000', lid: null }),
    update: async () => true,
  };
  svc.isAutoResponding = async () => !opcoes.pausado;
  svc.sendMandatoryMedias = async () => { await new Promise((r) => setTimeout(r, 5)); };
  svc.emitConversationCardIfFound = async () => {};
  svc.ragService = {
    processMessageAndRespond: async (_u: number, _c: number, msg: string) => {
      await openrouter.generateEmbedding(msg);
      return openrouter.generateResponse('prompt');
    },
  };
  const whatsapp: any = {
    sendMessage: async () => { await new Promise((r) => setTimeout(r, 10)); return {}; },
    sendMedia: async () => ({}),
  };
  return { svc, whatsapp, corpos };
}

test('TURN_METRICS=on grava uma linha por turno com tokens, cache, custo, modelo e ms', async () => {
  process.env.TURN_METRICS = 'on';
  fs.rmSync(ARQ, { force: true });
  const { svc, whatsapp, corpos } = criar();
  await svc.processIncomingMessage(1, 42, 'oi\ntudo bem?', whatsapp, { debounceMs: 3000, batchSize: 2 });
  const [l] = linhas();
  assert.ok(l, 'deveria gravar uma linha');
  assert.equal(linhas().length, 1);
  assert.equal(l.conversation_id, 42);
  assert.equal(l.mensagens_no_lote, 2);
  assert.equal(l.outcome, 'respondido');
  assert.equal(l.envios, 1);
  assert.equal(l.model, 'deepseek/deepseek-v4-flash');
  assert.equal(l.provider, 'Wafer');
  assert.equal(l.tokens_in, 4400);
  assert.equal(l.tokens_out, 30);
  assert.equal(l.tokens_cache, 4096);
  assert.equal(l.embedding_calls, 1);
  assert.equal(l.embedding_tokens, 12);
  assert.ok(Math.abs(l.cost_usd - 0.000401) < 1e-9);
  assert.equal(l.ms.debounce, 3000);
  for (const etapa of ['midias_obrigatorias', 'contexto', 'llm', 'embeddings', 'envio', 'total']) {
    assert.equal(typeof l.ms[etapa], 'number', `ms.${etapa}`);
  }
  assert.ok(l.ms.llm >= 10, `llm=${l.ms.llm}`);
  assert.ok(l.ms.envio >= 5, `envio=${l.ms.envio}`);
  assert.ok(l.ms.total >= 3000, `total=${l.ms.total}`);
  assert.equal(JSON.stringify(l).includes('tudo bem'), false, 'não grava conteúdo da mensagem');
  assert.deepEqual(corpos.find((c) => c.url === '/chat/completions').body.usage, { include: true });
});

test('falha do LLM: linha com outcome=erro_geracao e llm_failed', async () => {
  process.env.TURN_METRICS = 'on';
  fs.rmSync(ARQ, { force: true });
  const { svc, whatsapp } = criar({ falharLlm: true });
  await svc.processIncomingMessage(1, 43, 'oi', whatsapp);
  const [l] = linhas();
  assert.equal(l.outcome, 'erro_geracao');
  assert.equal(l.llm_failed, 1);
  assert.equal(l.envios, 0);
});

test('IA pausada: linha com outcome=pausado e nenhuma chamada', async () => {
  process.env.TURN_METRICS = 'on';
  fs.rmSync(ARQ, { force: true });
  const { svc, whatsapp } = criar({ pausado: true });
  await svc.processIncomingMessage(1, 44, 'oi', whatsapp);
  const [l] = linhas();
  assert.equal(l.outcome, 'pausado');
  assert.equal(l.llm_calls, 0);
});

test('TURN_METRICS=off: nada é gravado e o payload não muda', async () => {
  process.env.TURN_METRICS = 'off';
  fs.rmSync(ARQ, { force: true });
  const { svc, whatsapp, corpos } = criar();
  await svc.processIncomingMessage(1, 45, 'oi', whatsapp);
  assert.equal(fs.existsSync(ARQ), false);
  assert.equal('usage' in corpos.find((c) => c.url === '/chat/completions').body, false);
});

test('turnos simultâneos não misturam métricas', async () => {
  process.env.TURN_METRICS = 'on';
  fs.rmSync(ARQ, { force: true });
  const a = criar();
  const b = criar();
  await Promise.all([
    a.svc.processIncomingMessage(1, 46, 'a', a.whatsapp),
    b.svc.processIncomingMessage(1, 47, 'b', b.whatsapp),
  ]);
  const ls = linhas();
  assert.equal(ls.length, 2);
  for (const l of ls) {
    assert.equal(l.llm_calls, 1);
    assert.equal(l.embedding_calls, 1);
  }
});
