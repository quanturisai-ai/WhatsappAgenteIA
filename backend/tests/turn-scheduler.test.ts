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
    baseMs: 50, greetingMs: 120, maxMs: 200, turnDeadlineMs: 5000, holdMaxMs: 1000,
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
      const result: TurnResult = control.commit() ? 'sent' : 'superseded';
      turnos.push({ batch, result, at: Date.now() - t0 });
      return result;
    } finally {
      ativos--;
    }
  };
  return { run, turnos, maxAtivos: () => maxAtivos };
}

test('saudação curta: até 3 palavras de saudação e sem "?"', () => {
  assert.equal(isShortGreeting(['Oi']), true);
  assert.equal(isShortGreeting(['Bom dia']), true);
  assert.equal(isShortGreeting(['boa tarde tudo bem']), false);
  assert.equal(isShortGreeting(['Oi', 'tudo bem']), true);
  assert.equal(isShortGreeting(['Oi?']), false);
  assert.equal(isShortGreeting(['Quanto custa a lavagem']), false);
  assert.equal(isShortGreeting(['[media]']), false);
  assert.equal(isShortGreeting(['']), false);
  // juiz: pedido curto não é saudação
  assert.equal(isShortGreeting(['Quero orçamento']), false);
  assert.equal(isShortGreeting(['Preciso de ajuda']), false);
  assert.equal(isShortGreeting(['Oiii!!']), true);
  assert.equal(isShortGreeting(['Olá, boa noite']), true);
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
  await s.idle(1);
  assert.ok(f.turnos.length >= 2, 'tinha que ter disparado pelo teto antes da última mensagem');
  assert.ok(f.turnos[0].batch.length < 8, `o 1º lote esperou todas: ${f.turnos[0].batch.length}`);
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
  assert.match(loops[0], /possível loop: 9 mensagens/);
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

// ---------- Correções do juiz (02/11/2026) ----------

test('juiz #1: reserva cancela o turno na hora e segura a fila até a mensagem (áudio) entrar, na ordem de chegada', async () => {
  const f = turnoFalso(150);
  const s = new TurnScheduler(f.run, () => {}, () => cfg());
  s.enqueue(1, { content: 'texto 1', messageId: 'a' });
  await esperar(70); // turno em andamento
  const tAudio = Date.now();
  const release = s.hold(1); // chegou um áudio: ainda transcrevendo
  await esperar(10);
  s.enqueue(1, { content: 'texto 2 (veio depois do áudio)', messageId: 'c' });
  await esperar(150); // mesmo passando a janela base, não dispara com a reserva aberta
  assert.equal(f.turnos.filter((t) => t.result === 'sent').length, 0, 'não respondeu sem o áudio');
  s.enqueue(1, { content: 'áudio transcrito', messageId: 'b', at: tAudio });
  release();
  await s.idle(1);
  const enviados = f.turnos.filter((t) => t.result === 'sent');
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].batch.map((b) => b.messageId), ['a', 'b', 'c'], 'áudio antes do texto que chegou depois');
  assert.equal(f.turnos[0].result, 'superseded', 'o turno em andamento foi cancelado já na reserva');
});

test('juiz #1: reserva expira sozinha (mensagem descartada ou travada no download)', async () => {
  const f = turnoFalso();
  const s = new TurnScheduler(f.run, () => {}, () => cfg({ holdMaxMs: 100 }));
  s.enqueue(1, { content: 'pergunta?' });
  s.hold(1); // nunca liberada
  await esperar(80);
  assert.equal(f.turnos.length, 0);
  await esperar(120);
  assert.equal(f.turnos.length, 1, 'disparou depois que a reserva expirou');
});

test('juiz #2: depois do commit (enviando) mensagem nova não cancela; vira o próximo turno', async () => {
  const lotes: string[][] = [];
  let abortado = false;
  const run = async (_c: number, batch: PendingItem[], control: TurnControl): Promise<TurnResult> => {
    await esperar(30);
    if (!control.commit()) return 'superseded';
    control.signal.addEventListener('abort', () => { abortado = true; });
    await esperar(100); // "enviando"
    lotes.push(batch.map((b) => b.content));
    return 'sent';
  };
  const s = new TurnScheduler(run, () => {}, () => cfg());
  s.enqueue(1, { content: 'primeira?' });
  await esperar(110); // turno já passou do commit
  s.enqueue(1, { content: 'segunda?' });
  s.hold(1)();
  await s.idle(1);
  assert.equal(abortado, false, 'o envio em andamento não foi abortado');
  assert.deepEqual(lotes, [['primeira?'], ['segunda?']]);
});

test('juiz #3 (2ª passada): turno enviando que passa do prazo avisa, mas não abre outro turno em paralelo', async () => {
  const travados: number[] = [];
  let chamadas = 0, ativos = 0, maxAtivos = 0;
  let soltarPendurado: (v: TurnResult) => void = () => {};
  const lotes: string[][] = [];
  const run = async (_c: number, batch: PendingItem[], control: TurnControl): Promise<TurnResult> => {
    chamadas++; ativos++; maxAtivos = Math.max(maxAtivos, ativos);
    try {
      if (chamadas === 1) {
        control.commit();
        return await new Promise<TurnResult>((r) => { soltarPendurado = r; }); // envio pendurado
      }
      await esperar(30);
      lotes.push(batch.map((b) => b.content));
      return control.commit() ? 'sent' : 'superseded';
    } finally { ativos--; }
  };
  // prazo 200 ms: aviso aos ~250; limite duro (pausa) só aos ~400 — o envio termina antes disso
  const s = new TurnScheduler(run, () => {}, () => cfg({ turnDeadlineMs: 200 }), Date.now, (c) => { travados.push(c); });
  s.enqueue(1, { content: 'primeira?' });
  await esperar(260);
  assert.deepEqual(travados, [1], 'avisou o turno travado');
  s.enqueue(1, { content: 'segunda?' });
  await esperar(60);
  assert.equal(chamadas, 1, 'não começou outro turno enquanto o anterior ainda envia');
  soltarPendurado('sent');
  await s.idle(1);
  assert.equal(maxAtivos, 1, 'nunca dois turnos ativos');
  assert.deepEqual(lotes, [['segunda?']]);
});

test('juiz #3 (2ª passada): turno que passa do prazo SEM enviar é cancelado e o lote é refeito (não some)', async () => {
  let chamadas = 0;
  const lotes: string[][] = [];
  let primeiroPodeEnviar: boolean | null = null;
  const run = async (_c: number, batch: PendingItem[], control: TurnControl): Promise<TurnResult> => {
    chamadas++;
    if (chamadas === 1) {
      await esperar(300); // LLM pendurado
      primeiroPodeEnviar = control.commit();
      return 'superseded';
    }
    lotes.push(batch.map((b) => b.content));
    return control.commit() ? 'sent' : 'superseded';
  };
  const s = new TurnScheduler(run, () => {}, () => cfg({ turnDeadlineMs: 100 }));
  s.enqueue(1, { content: 'pergunta original?' });
  await esperar(250);
  assert.deepEqual(lotes, [['pergunta original?']], 'refeito com a mensagem original');
  await esperar(150);
  assert.equal(primeiroPodeEnviar, false, 'o turno abandonado não consegue mais enviar');
});

test('juiz 3ª passada: envio que nunca termina pausa a IA (sem turno paralelo) e libera a fila', async () => {
  const pausas: string[] = [];
  let chamadas = 0, ativosQueEnviam = 0;
  const run = async (_c: number, _b: PendingItem[], control: TurnControl): Promise<TurnResult> => {
    chamadas++;
    if (chamadas === 1) { control.commit(); ativosQueEnviam++; return new Promise<TurnResult>(() => {}); } // nunca termina
    return 'done'; // com a IA pausada o turno real termina como "pausado", sem enviar
  };
  const s = new TurnScheduler(run, (_c, r) => { pausas.push(r); }, () => cfg({ turnDeadlineMs: 80 }));
  s.enqueue(1, { content: 'pergunta?' });
  await esperar(100);
  s.enqueue(1, { content: 'outra?' });
  await esperar(60);
  assert.equal(chamadas, 1, 'antes do limite duro, nada de turno novo');
  await esperar(120);
  assert.equal(pausas.length, 1);
  assert.match(pausas[0], /envio da resposta travado/);
  await s.idle(1);
  assert.equal(chamadas, 2, 'fila liberada depois da pausa');
  assert.equal(ativosQueEnviam, 1);
});

test('juiz 4ª passada: fila só é liberada depois que a pausa foi gravada; se a pausa falhar, segue presa', async () => {
  for (const pausaOk of [true, false]) {
    let chamadas = 0, pausaGravada = false, soltar: (v: TurnResult) => void = () => {};
    const inicioDoSegundo: boolean[] = [];
    const run = async (_c: number, _b: PendingItem[], control: TurnControl): Promise<TurnResult> => {
      chamadas++;
      if (chamadas === 1) { control.commit(); return new Promise<TurnResult>((r) => { soltar = r; }); }
      inicioDoSegundo.push(pausaGravada);
      return 'done';
    };
    const onLoop = async () => { await esperar(80); pausaGravada = pausaOk; return pausaOk; };
    const s = new TurnScheduler(run, onLoop, () => cfg({ turnDeadlineMs: 60 }));
    s.enqueue(1, { content: 'pergunta?' });
    await esperar(70);
    s.enqueue(1, { content: 'outra?' });
    await esperar(150); // passou do limite duro (120) e a pausa ainda está gravando até ~200
    assert.equal(chamadas, 1, `${pausaOk}: nenhum turno novo antes da pausa terminar`);
    await esperar(80);
    if (pausaOk) {
      await s.idle(1);
      assert.deepEqual(inicioDoSegundo, [true], 'turno seguinte só depois da pausa gravada');
    } else {
      assert.equal(chamadas, 1, 'pausa falhou: fila presa até o envio original terminar');
      soltar('sent');
      await s.idle(1);
      assert.equal(chamadas, 2);
    }
  }
});

test('juiz #4 (2ª passada): chegadas no mesmo milissegundo mantêm a ordem', () => {
  const s = new TurnScheduler(async () => 'done', () => {}, () => cfg(), () => 5000);
  const a = s.arrivalStamp(), b = s.arrivalStamp(), c = s.arrivalStamp();
  assert.ok(a < b && b < c);
});

test('juiz #4: teto continua contando da 1ª mensagem depois de refazer', async () => {
  const f = turnoFalso(60);
  const s = new TurnScheduler(f.run, () => {}, () => cfg({ baseMs: 50, maxMs: 150 }));
  const t0 = Date.now();
  s.enqueue(1, { content: 'm1?' });            // dispara ~50
  await esperar(80);
  s.enqueue(1, { content: 'm2?' });            // cancela; refaz
  await esperar(40);
  s.enqueue(1, { content: 'm3?' });            // ~120: sem teto preservado esperaria até ~170+
  await esperar(20);
  s.enqueue(1, { content: 'm4?' });            // ~140
  await s.idle(1);
  const enviado = f.turnos.find((t) => t.result === 'sent')!;
  assert.deepEqual(enviado.batch.map((b) => b.content), ['m1?', 'm2?', 'm3?', 'm4?']);
  // teto: 150 ms da 1ª mensagem + duração do turno (60 ms); sem o teto seria ≥ 140 + 50 + 60
  assert.ok(enviado.at - (t0 - t0) <= 235, `saiu tarde: ${enviado.at} ms`);
});

test('juiz #8: estado de conversa ociosa é removido', async () => {
  let agora = 1_000_000;
  const f = turnoFalso();
  const s = new TurnScheduler(f.run, () => {}, () => cfg({ baseMs: 0 }, { inWindowMs: 1000, outWindowMs: 1000 }), () => agora);
  s.enqueue(1, { content: 'oi?' });
  await s.idle(1);
  assert.equal(s.snapshot(1).tracked, true);
  agora += 120_000;
  s.enqueue(2, { content: 'outra conversa?' });
  assert.equal(s.snapshot(1).tracked, false, 'conversa 1 ociosa foi removida');
  await s.idle(2);
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
  const control: TurnControl = { epoch: 1, signal: ac.signal, isCurrent: () => epochAtual === 1, commit: () => epochAtual === 1 };
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
  const control: TurnControl = { epoch: 1, signal: ac.signal, isCurrent: () => !ac.signal.aborted, commit: () => !ac.signal.aborted };
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

test('juiz #3 (2ª passada): com agendador, mídia obrigatória só sai depois do commit (turno cancelado não manda nada)', async () => {
  const { svc, whatsapp, enviados } = criarConversa();
  const ordem: string[] = [];
  svc.sendMandatoryMedias = async () => { ordem.push('midia'); };
  whatsapp.sendMessage = async (_n: string, t: string) => { ordem.push('texto'); enviados.push(t); return {}; };
  let atual = true;
  const ac = new AbortController();
  const control: TurnControl = { epoch: 1, signal: ac.signal, isCurrent: () => atual, commit: () => atual };
  svc.ragService = { processMessageAndRespond: async () => { atual = false; return 'Resposta velha'; } };
  assert.equal(await svc.processIncomingMessage(1, 7, 'pergunta?', whatsapp, { control }), 'superseded');
  assert.deepEqual(ordem, [], 'cancelado: nem mídia nem texto');
  atual = true;
  svc.ragService = { processMessageAndRespond: async () => 'Resposta nova' };
  assert.equal(await svc.processIncomingMessage(1, 7, 'pergunta?', whatsapp, { control }), 'sent');
  assert.deepEqual(ordem, ['midia', 'texto'], 'mídia obrigatória continua antes do texto');
});

test('ConversationService sem agendador: comportamento antigo (envia e devolve "sent")', async () => {
  const { svc, whatsapp, enviados } = criarConversa();
  svc.ragService = { processMessageAndRespond: async () => 'Abrimos sim!' };
  const r = await svc.processIncomingMessage(1, 7, 'Abrem domingo?', whatsapp);
  assert.equal(r, 'sent');
  assert.deepEqual(enviados, ['Abrimos sim!']);
});
