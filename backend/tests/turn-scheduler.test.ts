// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/turn-scheduler.test.ts
// Item 2 (02/11/2026): debounce 5/8/15 s, trava por conversa, epoch/cancelamento, anti-loop.
// Sem banco e sem rede. Tempos em escala reduzida (ms) via variáveis de ambiente.
process.env.TURN_METRICS = 'off';
process.env.WHATSAPP_PROVIDER = 'synczap';
process.env.SYNCZ_BASE_URL = 'http://synczap.invalid';
process.env.SYNCZ_API_KEY = 'chave-de-teste';
process.env.SYNCZ_INSTANCE_ID = 'instancia-teste';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnScheduler, SchedulerConfig, isShortGreeting, PendingItem, TurnResult } from '../src/services/turnScheduler';
import { TurnControl } from '../src/utils/turnControl';
import { ConversationService } from '../src/services/conversation.service';
import { OpenRouterService } from '../src/services/openrouter.service';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FONE = '5561900000001';

function cfg(over: Partial<SchedulerConfig> = {}, loop: Partial<SchedulerConfig['antiLoop']> = {}): SchedulerConfig {
  return {
    baseMs: 50, greetingMs: 120, maxMs: 200,
    ...over,
    antiLoop: { enabled: false, maxIn: 8, inWindowMs: 2000, maxOut: 20, outWindowMs: 5000, cooldownMs: 10000, ...loop },
  };
}

/** Turno falso: demora `ms`, confere o epoch antes de "enviar" (como o ConversationService). */
function turnoFalso(ms = 0) {
  const turnos: { batch: PendingItem[]; result: TurnResult; at: number }[] = [];
  let ativos = 0;
  let maxAtivos = 0;
  const t0 = Date.now();
  const run = async (_c: number, batch: PendingItem[], control: TurnControl): Promise<TurnResult> => {
    ativos++;
    maxAtivos = Math.max(maxAtivos, ativos);
    try {
      if (ms) await new Promise<void>((r) => { const t = setTimeout(r, ms); control.signal.addEventListener('abort', () => { clearTimeout(t); r(); }); });
      const result: TurnResult = control.isCurrent() ? 'sent' : 'superseded';
      turnos.push({ batch, result, at: Date.now() - t0 });
      return result;
    } finally {
      ativos--;
    }
  };
  return { run, turnos, maxAtivos: () => maxAtivos };
}

test('saudação curta: até 3 palavras e sem "?"', () => {
  assert.equal(isShortGreeting(['Oi']), true);
  assert.equal(isShortGreeting(['Bom dia']), true);
  assert.equal(isShortGreeting(['boa tarde tudo bem']), false);
  assert.equal(isShortGreeting(['Oi', 'tudo bem']), true);
  assert.equal(isShortGreeting(['Oi?']), false);
  assert.equal(isShortGreeting(['Quanto custa a lavagem']), false);
  assert.equal(isShortGreeting(['[media]']), false);
  assert.equal(isShortGreeting(['']), false);
});

test('debounce: pergunta espera a janela base; saudação curta espera mais', async () => {
  const f = turnoFalso();
  const s = new TurnScheduler(f.run, () => {}, () => cfg());
  const t0 = Date.now();
  s.enqueue(1, { content: 'Quanto custa a lavagem?', messageId: 'w1', dbId: 11 });
  s.enqueue(2, { content: 'Oi', messageId: 'w2', dbId: 21 });
  await esperar(80);
  assert.equal(f.turnos.length, 1, 'a pergunta já saiu (50 ms), a saudação ainda espera (120 ms)');
  assert.equal(f.turnos[0].batch[0].messageId, 'w1');
  await s.idle(2);
  assert.equal(f.turnos.length, 2);
  assert.ok(Date.now() - t0 >= 115);
});

test('debounce: teto desde a 1ª mensagem mesmo com cliente digitando sem parar', async () => {
  const f = turnoFalso();
  const s = new TurnScheduler(f.run, () => {}, () => cfg());
  const t0 = Date.now();
  for (let i = 0; i < 8; i++) { s.enqueue(1, { content: `parte ${i} da pergunta longa`, dbId: i }); await esperar(35); }
  // 8 x 35 ms = 280 ms > teto de 200 ms: o 1º turno tem que ter saído perto dos 200 ms.
  assert.ok(f.turnos.length >= 1, 'tinha que ter disparado pelo teto');
  assert.ok(f.turnos[0].at <= 260, `disparou tarde demais: ${f.turnos[0].at} ms`);
  await s.idle(1);
  const todos = f.turnos.flatMap((t) => t.batch.map((b) => b.dbId));
  assert.deepEqual(todos, [0, 1, 2, 3, 4, 5, 6, 7], 'nenhuma mensagem perdida nem repetida');
  assert.ok(Date.now() - t0 < 1000);
});

test('trava + cancelamento: mensagem durante o turno cancela e refaz com tudo junto (1 resposta só)', async () => {
  const f = turnoFalso(150);
  const s = new TurnScheduler(f.run, () => {}, () => cfg());
  s.enqueue(1, { content: 'Vocês abrem domingo?', messageId: 'a', dbId: 1 });
  await esperar(100); // turno em andamento
  s.enqueue(1, { content: 'e feriado?', messageId: 'b', dbId: 2 });
  await s.idle(1);
  const enviados = f.turnos.filter((t) => t.result === 'sent');
  assert.equal(f.maxAtivos(), 1, 'nunca dois turnos ao mesmo tempo na conversa');
  assert.equal(enviados.length, 1, 'uma resposta só');
  assert.deepEqual(enviados[0].batch.map((b) => b.messageId), ['a', 'b'], 'refeito com as duas mensagens, em ordem');
  assert.equal(f.turnos[0].result, 'superseded');
});

test('trava: se o turno já enviou, a mensagem nova vira o próximo turno (sem misturar)', async () => {
  const f = turnoFalso();
  // Turno que "já passou da conferência" e demora no envio: ignora o abort.
  let ativos = 0, max = 0;
  const lotes: string[][] = [];
  const run = async (_c: number, batch: PendingItem[]): Promise<TurnResult> => {
    ativos++; max = Math.max(max, ativos);
    await esperar(120);
    lotes.push(batch.map((b) => b.content));
    ativos--;
    return 'sent';
  };
  const s = new TurnScheduler(run, () => {}, () => cfg());
  s.enqueue(1, { content: 'primeira pergunta?' });
  await esperar(90);
  s.enqueue(1, { content: 'segunda pergunta?' });
  await esperar(20);
  s.enqueue(1, { content: 'terceira?' });
  await s.idle(1);
  assert.equal(max, 1);
  assert.deepEqual(lotes, [['primeira pergunta?'], ['segunda pergunta?', 'terceira?']]);
  void f;
});

test('conversas diferentes não se travam', async () => {
  const f = turnoFalso(100);
  const s = new TurnScheduler(f.run, () => {}, () => cfg());
  s.enqueue(1, { content: 'pergunta 1?' });
  s.enqueue(2, { content: 'pergunta 2?' });
  await esperar(170);
  assert.equal(f.turnos.length, 2, 'as duas conversas rodam em paralelo');
});

test('anti-loop: rajada de mensagens pausa uma vez e não chama o LLM', async () => {
  const f = turnoFalso();
  const loops: string[] = [];
  const s = new TurnScheduler(f.run, (_c, r) => { loops.push(r); }, () => cfg({ baseMs: 300, maxMs: 1000 }, { enabled: true, maxIn: 8 }));
  for (let i = 0; i < 12; i++) s.enqueue(1, { content: `msg ${i}?` });
  await esperar(20);
  assert.equal(loops.length, 1, 'avisa uma vez só');
  assert.match(loops[0], /9 mensagens/);
  await s.idle(1);
  // Depois do disparo a fila foi descartada; as 3 que vieram depois seguem o fluxo normal
  // (com a IA pausada, o turno real termina como "pausado").
  assert.equal(f.turnos.length, 1);
  assert.deepEqual(f.turnos[0].batch.map((b) => b.content), ['msg 9?', 'msg 10?', 'msg 11?']);
});

test('anti-loop: muitas respostas em pouco tempo pausa', async () => {
  const f = turnoFalso();
  const loops: string[] = [];
  const s = new TurnScheduler(f.run, (_c, r) => { loops.push(r); }, () => cfg({ baseMs: 5 }, { enabled: true, maxOut: 2, maxIn: 100 }));
  for (let i = 0; i < 3; i++) { s.enqueue(1, { content: `pergunta ${i}?` }); await s.idle(1); }
  assert.equal(f.turnos.length, 3);
  assert.equal(loops.length, 1);
  assert.match(loops[0], /3 respostas/);
});

test('anti-loop desligado (ANTILOOP=off) não dispara', async () => {
  const f = turnoFalso();
  const loops: string[] = [];
  const s = new TurnScheduler(f.run, (_c, r) => { loops.push(r); }, () => cfg({ baseMs: 5 }));
  for (let i = 0; i < 15; i++) s.enqueue(1, { content: `m${i}?` });
  await s.idle(1);
  assert.equal(loops.length, 0);
  assert.equal(f.turnos.length, 1);
  assert.equal(f.turnos[0].batch.length, 15);
});

// ---------- ConversationService real: epoch conferido antes do envio + cancelamento do LLM ----------

function criarConversa() {
  const svc: any = new ConversationService();
  const enviados: string[] = [];
  const updates: any[] = [];
  svc.conversationModel = {
    findById: async (id: number) => ({ id, user_id: 1, contact_number: FONE, lid: null, auto_responding: 1 }),
    update: async (_id: number, u: any) => { updates.push(u); return true; },
    getConversationCardById: async () => null,
  };
  svc.isAutoResponding = async () => true;
  svc.sendMandatoryMedias = async () => {};
  svc.emitConversationCardIfFound = async () => {};
  svc.humanAttendantService = { getAttendants: async () => [], sendAlert: async () => {} };
  const whatsapp: any = { sendMessage: async (_n: string, t: string) => { enviados.push(t); return {}; }, sendMedia: async () => ({}) };
  return { svc, whatsapp, enviados, updates };
}

test('ConversationService: epoch mudou depois da geração -> não envia e não marca intervenção', async () => {
  const { svc, whatsapp, enviados, updates } = criarConversa();
  let epochAtual = 1;
  const ac = new AbortController();
  const control: TurnControl = { epoch: 1, signal: ac.signal, isCurrent: () => epochAtual === 1 };
  svc.ragService = { processMessageAndRespond: async () => { epochAtual = 2; return 'Abrimos sim!'; } };
  const r = await svc.processIncomingMessage(1, 7, 'Abrem domingo?', whatsapp, { control });
  assert.equal(r, 'superseded');
  assert.deepEqual(enviados, []);
  assert.equal(updates.some((u) => u.needs_intervention), false);
});

test('ConversationService: mensagem nova aborta a chamada ao LLM em andamento (sem fallback, sem intervenção)', async () => {
  const { svc, whatsapp, enviados, updates } = criarConversa();
  const openrouter: any = new OpenRouterService();
  const posts: any[] = [];
  openrouter.axiosInstance = {
    post: (url: string, _b: any, opts?: any) => {
      posts.push({ url, signal: opts?.signal });
      if (url === '/embeddings') return Promise.resolve({ data: { data: [{ embedding: [0.1] }] } });
      return new Promise((_res, rej) => {
        opts?.signal?.addEventListener('abort', () => { const e: any = new Error('canceled'); e.name = 'CanceledError'; e.code = 'ERR_CANCELED'; rej(e); });
      });
    },
  };
  svc.ragService.ollamaService = openrouter;
  svc.ragService.buildPrompt = async () => 'prompt';
  svc.ragService.agentConfigModel = { findByUserId: async () => ({}) };
  svc.ragService.conversationModel = svc.conversationModel;
  const ac = new AbortController();
  const control: TurnControl = { epoch: 1, signal: ac.signal, isCurrent: () => !ac.signal.aborted };
  setTimeout(() => ac.abort(), 50);
  const t0 = Date.now();
  const r = await svc.processIncomingMessage(1, 7, 'Abrem domingo?', whatsapp, { control });
  assert.equal(r, 'superseded');
  assert.ok(Date.now() - t0 < 1000, 'cancelou na hora, não esperou o LLM');
  assert.equal(posts.filter((p) => p.url === '/chat/completions').length, 1, 'sem 2ª chamada de fallback');
  assert.ok(posts[0].signal, 'o sinal de cancelamento chegou ao axios');
  assert.deepEqual(enviados, []);
  assert.equal(updates.some((u) => u.needs_intervention), false);
});

test('ConversationService sem agendador: comportamento antigo (envia e devolve "sent")', async () => {
  const { svc, whatsapp, enviados } = criarConversa();
  svc.ragService = { processMessageAndRespond: async () => 'Abrimos sim!' };
  const r = await svc.processIncomingMessage(1, 7, 'Abrem domingo?', whatsapp);
  assert.equal(r, 'sent');
  assert.deepEqual(enviados, ['Abrimos sim!']);
});
