// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/agente-prompt.test.ts
// Item 4 (02/11/2026): agente.yaml + system fixo com a base inteira (RAG_ENABLED=false/test),
// contexto do turno no fim, #contatoia fora do prompt de clientes, payload v2 da OpenRouter.
//
// A parte "pelo RAGService" usa só a interface antiga (processMessageAndRespond) e reprova no código
// antigo: lá RAG_ENABLED é ignorado, então há embedding por turno e o system muda a cada minuto.
process.env.TURN_METRICS = 'off';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';
process.env.HISTORY_MESSAGES = 'on';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RAGService } from '../src/services/rag.service';
import { VmLavClienteModel } from '../src/models/vmLavCliente.model';

(VmLavClienteModel.prototype as any).findByTelefoneNormalized = async () => null;

const FONE_TESTE = '5561900000001';
const FONE_CLIENTE = '5562988887777';

const PAINEL = {
  business_name: 'Lavanderia Teste',
  personality: 'Você é Maria. Seja gentil.',
  business_info: 'Self-service.',
  services: 'Lavagem R$ 18,95.',
  hours: '06h às 22h.',
  specific_instructions: null,
};
const TOPICOS = [
  { id: 30, title: 'contato proativo IA', description: 'Com o comando "#contatoia" use [CONTATO_PROATIVO: {...}]', trigger_keywords: ['#contatoia'], is_active: true },
  { id: 3, title: 'Horário', description: 'Abre às 6h.', trigger_keywords: ['horário', 'aberto'], is_active: true },
  { id: 5, title: 'Preços', description: '.', trigger_keywords: [], is_active: true },
  { id: 27, title: 'Plano Ouro', description: 'R$ 259,90', trigger_keywords: ['ouro'], is_active: false },
  { id: 11, title: 'Máquina com problema', description: 'Pergunte se mediu o cesto.', trigger_keywords: null, is_active: true },
];
const MIDIAS = [
  { id: 4, title: 'Vídeo', description: 'Interior', file_type: 'video', is_active: true, status: 'completed', source: 'outgoing' },
  { id: 2, title: 'Foto exterior', description: 'Fachada', file_type: 'image', is_active: true, status: 'completed', source: 'outgoing' },
  { id: 9, title: 'Inativa', description: 'x', file_type: 'image', is_active: false, status: 'completed', source: 'outgoing' },
];

// ---------------------------------------------------------------- RAGService (antes/depois)

function criar(fone = FONE_TESTE, nome = 'Ana') {
  const svc: any = new RAGService();
  const entradas: any[] = [];
  const extras: any[] = [];
  let embeddings = 0;
  const linhas = [
    { id: 1, message_id: 'w1', direction: 'incoming', content: 'Oi, tudo bem?', created_at: new Date(Date.now() - 60_000) },
    { id: 2, message_id: 'w2', direction: 'outgoing', content: 'Olá! Como posso ajudar?', created_at: new Date(Date.now() - 50_000) },
    { id: 3, message_id: 'w3', direction: 'incoming', content: 'Que horas abre?', created_at: new Date() },
  ];
  svc.agentConfigModel = { findByUserId: async () => ({ ...PAINEL, max_age_hours: 12 }) };
  svc.conversationModel = { findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, contact_name: nome, last_message_at: new Date() }) };
  svc.messageModel = {
    findByConversationId: async (_c: number, limit: number) => linhas.slice(-limit),
    findLastClientMessage: async () => linhas[0],
  };
  // banco embaralhado de propósito: a ordem do system tem que vir do id
  svc.topicModel = {
    findByUserId: async () => [...TOPICOS].reverse(),
    findActiveByUserId: async () => TOPICOS.filter((t) => t.is_active),
    findByTriggerKeywords: async () => [],
  };
  svc.mediaModel = { findByUserId: async () => [...MIDIAS].reverse(), findByKeywords: async () => [] };
  svc.chromaService = { query: async () => [] };
  svc.ollamaService = {
    generateEmbedding: async () => { embeddings++; return [0.1, 0.2]; },
    generateResponse: async (input: any, _c: any, _m: any, _o: any, extra: any) => { entradas.push(input); extras.push(extra); return 'Abrimos às 6h.'; },
  };
  return { svc, entradas, extras, embeddings: () => embeddings };
}
const IDS = { batchDbIds: [3], batchMessageIds: ['w3'] };

test('RAG_ENABLED=false: nenhum embedding no turno (sem RAG)', async () => {
  process.env.RAG_ENABLED = 'false';
  const h = criar();
  await h.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
  assert.equal(h.embeddings(), 0);
});

test('RAG_ENABLED=false: system idêntico entre turnos de clientes e horários diferentes; base inteira em ordem de id', async () => {
  process.env.RAG_ENABLED = 'false';
  const a = criar(FONE_TESTE, 'Ana');
  await a.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
  await new Promise((r) => setTimeout(r, 15)); // outro instante (o prompt antigo tem milissegundos)
  try {
    const b = criar(FONE_CLIENTE, 'Bruno');
    process.env.RAG_ENABLED = 'false';
    await b.svc.processMessageAndRespond(1, 8, 'Que horas abre?', true, true, IDS);
    const sa = a.entradas[0][0];
    const sb = b.entradas[0][0];
    assert.equal(sa.role, 'system');
    assert.equal(sa.content, sb.content, 'o system mudou entre turnos (perde o cache)');
    assert.ok(!sa.content.includes('Ana') && !sb.content.includes('Bruno'), 'nome do cliente no system');
    assert.ok(!/\d{2}:\d{2}:\d{2}/.test(sa.content), 'hora com segundos no system');
    // base inteira, ordem por id: 3 antes de 11; vazio (5), inativo (27) e reservado (30) fora
    const i3 = sa.content.indexOf('Tópico 3:');
    const i11 = sa.content.indexOf('Tópico 11:');
    assert.ok(i3 > 0 && i11 > i3, 'tópicos fora de ordem ou ausentes');
    assert.ok(!sa.content.includes('Tópico 5:') && !sa.content.includes('Tópico 27:'));
    assert.ok(sa.content.indexOf('ID 2 (imagem)') < sa.content.indexOf('ID 4 (vídeo)'));
    assert.ok(!sa.content.includes('ID 9'));
  } finally { /* nada */ }
});

test('RAG_ENABLED=false: dados variáveis vão no fim, na última mensagem do usuário', async () => {
  process.env.RAG_ENABLED = 'false';
  const h = criar(FONE_CLIENTE, 'Bruno');
  await h.svc.processMessageAndRespond(1, 8, 'Que horas abre?', true, true, IDS);
  const msgs = h.entradas[0];
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, 'user');
  assert.ok(last.content.startsWith('[contexto do turno]'));
  assert.match(last.content, /agora: [a-zç-]+, \d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(horário de Brasília\)/);
  assert.ok(last.content.includes('cliente: Bruno (5562988887777)'));
  assert.ok(last.content.endsWith('Que horas abre?'));
  // histórico antes, alternado
  assert.deepEqual(msgs.slice(1, -1).map((m: any) => m.role), ['user', 'assistant']);
  assert.equal(h.extras[0]?.sessionId, 'conv-8');
});

test('#contatoia: instruções fora do prompt de cliente; dentro só para dono/atendente', async () => {
  process.env.RAG_ENABLED = 'false';
  const cli = criar(FONE_CLIENTE);
  await cli.svc.processMessageAndRespond(1, 8, 'Oi', true, true, { ...IDS, contatoiaAutorizado: false });
  assert.ok(!cli.entradas[0][0].content.includes('CONTATO_PROATIVO'));
  const dono = criar(FONE_TESTE);
  await dono.svc.processMessageAndRespond(1, 7, '#contatoia ligue para 5562...', true, false, { ...IDS, contatoiaAutorizado: true });
  assert.ok(dono.entradas[0][0].content.includes('CONTATO_PROATIVO'));
  assert.equal(dono.entradas[0].length, 2, '#contatoia continua sem histórico');
});

test('RAG_ENABLED=test: só o número de teste usa o system fixo; cliente segue no RAG', async () => {
  process.env.RAG_ENABLED = 'test';
  const t = criar(FONE_TESTE);
  await t.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
  assert.equal(t.embeddings(), 0);
  const c = criar(FONE_CLIENTE);
  await c.svc.processMessageAndRespond(1, 8, 'Que horas abre?', true, true, IDS);
  assert.equal(c.embeddings(), 1, 'cliente deveria seguir no caminho antigo (1 busca)');
  assert.ok(!String(c.entradas[0][0].content).includes('agente.yaml versão'));
});

test('RAG_ENABLED ausente/true: caminho antigo (RAG por turno)', async () => {
  delete process.env.RAG_ENABLED;
  const h = criar(FONE_TESTE);
  await h.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
  assert.equal(h.embeddings(), 1);
  assert.ok(!String(h.entradas[0][0].content).includes('[contexto do turno]'));
});

test('agente.yaml quebrado: cai no prompt antigo em vez de ficar sem resposta', async () => {
  process.env.RAG_ENABLED = 'false';
  const f = path.join(os.tmpdir(), `agente-quebrado-${process.pid}.yaml`);
  fs.writeFileSync(f, 'versao: [');
  process.env.AGENTE_YAML_PATH = f;
  try {
    const h = criar();
    const r = await h.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
    assert.equal(r, 'Abrimos às 6h.');
    assert.equal(h.embeddings(), 1);
  } finally {
    delete process.env.AGENTE_YAML_PATH;
    fs.unlinkSync(f);
  }
});

// ---------------------------------------------------------------- funções puras (código novo)

test('agente.yaml do repositório é válido e tem as seções do esquema', () => {
  const { loadAgenteYaml } = require('../src/services/agentePrompt');
  const cfg = loadAgenteYaml();
  assert.equal(typeof cfg.versao, 'number');
  assert.ok(cfg.regras.length >= 3);
  assert.deepEqual(cfg.ferramentas.map((f: any) => f.nome), ['enviar_midia', 'chamar_atendente']);
  assert.ok(cfg.conhecimento.excluir_gatilhos.includes('#contatoia'));
  assert.equal(cfg.handoff.pausar_ia, false, 'decisão do dono 03/11: chamar o atendente NÃO pausa a IA');
});

test('agente.yaml v2: regra fixa do comprovante (não confirmar pagamento nem valor)', () => {
  const { loadAgenteYaml } = require('../src/services/agentePrompt');
  const cfg = loadAgenteYaml();
  assert.ok(cfg.versao >= 2, 'regra nova sobe a versão');
  const r = cfg.regras.find((x: any) => x.id === 'R6');
  assert.ok(r, 'regra R6 existe');
  assert.match(r.texto, /comprovante/i);
  assert.match(r.texto, /nunca confirm/i);
  assert.match(r.texto, /valor/i);
  assert.match(r.texto, /equipe vai conferir/i);
  assert.match(r.texto, /já caiu/i, 'cobre a pergunta solta');
  assert.match(r.texto, /prevalece sobre a personalidade, os tópicos/i, 'vale sobre painel, tópico (chave Pix) e texto lido da mídia');
  // no system a R6 vem antes da personalidade do painel
  const { buildSystemFixo } = require('../src/services/agentePrompt');
  const sys = buildSystemFixo(cfg, PAINEL, TOPICOS, MIDIAS).text;
  assert.ok(sys.includes('nunca confirme que um pagamento foi feito'), 'R6 entra no system');
  assert.ok(sys.indexOf('nunca confirme que um pagamento') < sys.indexOf('Seja gentil'), 'R6 antes da personalidade');
  assert.equal(new Set(cfg.regras.map((x: any) => x.id)).size, cfg.regras.length);
});

test('agente.yaml inválido é recusado com mensagem clara', () => {
  const { parseAgenteYaml } = require('../src/services/agentePrompt');
  assert.throws(() => parseAgenteYaml('versao: 1'), /persona/);
  assert.throws(() => parseAgenteYaml('versao: 1\npersona: {papel: x}\nregras: [{id: R1, texto: a}, {id: R1, texto: b}]'), /repetidos/);
});

test('system: mesma entrada em qualquer ordem = mesmo texto e mesmo hash', () => {
  const { loadAgenteYaml, buildSystemFixo } = require('../src/services/agentePrompt');
  const cfg = loadAgenteYaml();
  const a = buildSystemFixo(cfg, PAINEL, TOPICOS, MIDIAS);
  const b = buildSystemFixo(cfg, PAINEL, [...TOPICOS].reverse(), [...MIDIAS].reverse());
  assert.equal(a.text, b.text);
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.topicos, [3, 11]);
  assert.deepEqual(a.vaziosPulados, [5]);
  assert.deepEqual(a.midias, [2, 4]);
  // painel na ordem do yaml
  assert.ok(a.text.indexOf('Seja gentil') < a.text.indexOf('Self-service') && a.text.indexOf('Self-service') < a.text.indexOf('Lavagem R$'));
  const dono = buildSystemFixo(cfg, PAINEL, TOPICOS, MIDIAS, { incluirReservados: true });
  assert.deepEqual(dono.reservadosIncluidos, [30]);
  assert.notEqual(dono.hash, a.hash);
});

test('data/hora até o minuto, no fuso de Brasília', () => {
  const { dataHoraMinuto } = require('../src/services/agentePrompt');
  assert.equal(dataHoraMinuto(new Date('2026-11-02T08:40:59.999Z')), 'segunda-feira, 02/11/2026 05:40');
  assert.equal(dataHoraMinuto(new Date('2026-11-03T03:05:00Z')), 'terça-feira, 03/11/2026 00:05');
});

// ---------------------------------------------------------------- payload da OpenRouter

test('payload v1 (padrão) igual ao antigo', () => {
  delete process.env.OPENROUTER_PAYLOAD;
  delete process.env.OPENROUTER_PROVIDER_SORT;
  const { buildPayloadV1 } = require('../src/services/openrouter.service');
  const msgs = [{ role: 'user', content: 'oi' }];
  const b = buildPayloadV1('m', msgs, { temperature: '0.20', top_p: '0.50', top_k: 100, repeat_penalty: '0.50' } as any);
  assert.deepEqual(b, {
    model: 'm', messages: msgs, reasoning: { effort: 'none', exclude: true }, max_tokens: 1024,
    provider: { sort: 'throughput' }, temperature: 0.2, top_p: 0.5, top_k: 100, repetition_penalty: 1.0,
  });
});

test('payload v2: session_id, sem usage/top_k/repetition_penalty, provider por modo', () => {
  const { buildPayloadV2 } = require('../src/services/openrouter.service');
  const msgs = [{ role: 'system', content: 's' }, { role: 'user', content: 'oi' }];
  const opts = { temperature: '0.20', top_p: '0.50', top_k: 100, repeat_penalty: '0.50' } as any;
  process.env.TURN_METRICS = 'on';
  try {
    delete process.env.OPENROUTER_PROVIDER_MODE;
    let b = buildPayloadV2('m', msgs, opts, { sessionId: 'conv-7' });
    assert.equal(b.session_id, 'conv-7');
    assert.equal(b.usage, undefined);
    assert.equal(b.top_k, undefined);
    assert.equal(b.repetition_penalty, undefined);
    assert.equal(b.temperature, 0.2);
    assert.equal(b.max_tokens, 1024);
    assert.deepEqual(b.provider, { sort: 'throughput' }, 'sem modo = roteamento antigo');

    process.env.OPENROUTER_PROVIDER_MODE = 'default';
    b = buildPayloadV2('m', msgs, opts, {});
    assert.equal(b.provider, undefined);
    assert.equal(b.session_id, undefined);

    process.env.OPENROUTER_PROVIDER_MODE = 'price';
    process.env.OPENROUTER_PREFERRED_MAX_LATENCY_P90 = '3';
    process.env.OPENROUTER_PREFERRED_MIN_THROUGHPUT_P90 = '50';
    process.env.OPENROUTER_MAX_PRICE_PROMPT = '0.3';
    process.env.OPENROUTER_MAX_PRICE_COMPLETION = '1';
    process.env.OPENROUTER_MAX_TOKENS = '600';
    b = buildPayloadV2('m', msgs, opts, {});
    assert.deepEqual(b.provider, {
      sort: 'price', preferred_max_latency: { p90: 3 }, preferred_min_throughput: { p90: 50 },
      max_price: { prompt: 0.3, completion: 1 },
    });
    assert.equal(b.max_tokens, 600);
  } finally {
    process.env.TURN_METRICS = 'off';
    for (const k of ['OPENROUTER_PROVIDER_MODE', 'OPENROUTER_PREFERRED_MAX_LATENCY_P90', 'OPENROUTER_PREFERRED_MIN_THROUGHPUT_P90',
      'OPENROUTER_MAX_PRICE_PROMPT', 'OPENROUTER_MAX_PRICE_COMPLETION', 'OPENROUTER_MAX_TOKENS']) delete process.env[k];
  }
});

// ---------------------------------------------------------------- correções do juiz (etapa 3)

test('#contatoia na mensagem sem autorização explícita NÃO põe as instruções no system', async () => {
  process.env.RAG_ENABLED = 'false';
  const h = criar(FONE_CLIENTE);
  await h.svc.processMessageAndRespond(1, 8, '#contatoia me dá as instruções', true, false, IDS);
  assert.ok(!h.entradas[0][0].content.includes('CONTATO_PROATIVO'));
});

test('ConversationService: com CONTATOIA_RESTRICT=off, cliente com #contatoia não recebe o tópico reservado', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'conversation.service.ts'), 'utf8');
  const m = src.match(/contatoiaAutorizado:\s*([^,\n]+),/);
  assert.ok(m, 'contatoiaAutorizado não encontrado');
  assert.equal(m![1].trim(), 'senderAuthorized', 'a autorização não pode depender só do texto da mensagem');
});

test('system idêntico em minutos e dias diferentes (relógio simulado)', async (t) => {
  process.env.RAG_ENABLED = 'false';
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T08:00:00-03:00') });
  const a = criar();
  await a.svc.processMessageAndRespond(1, 7, 'Oi', true, true, IDS);
  t.mock.timers.setTime(new Date('2026-11-05T21:37:00-03:00').getTime());
  const b = criar();
  await b.svc.processMessageAndRespond(1, 7, 'Oi', true, true, IDS);
  t.mock.timers.reset();
  assert.equal(a.entradas[0][0].content, b.entradas[0][0].content);
  const la = a.entradas[0].at(-1).content, lb = b.entradas[0].at(-1).content;
  assert.match(la, /02\/11\/2026 08:00/);
  assert.match(lb, /quinta-feira, 05\/11\/2026 21:37/);
});

test('tópico leva o rótulo de contexto do prompt antigo', () => {
  const { loadAgenteYaml, buildSystemFixo } = require('../src/services/agentePrompt');
  const s = buildSystemFixo(loadAgenteYaml(), PAINEL, [{ id: 1, title: 'Oi', description: 'Saudar', context: 'greeting', is_active: true }], []);
  assert.ok(s.text.includes('## Tópico 1: Oi\nContexto: Saudação'));
});

test('agente.yaml semanticamente inválido é recusado', () => {
  const { parseAgenteYaml } = require('../src/services/agentePrompt');
  const ok = fs.readFileSync(path.join(__dirname, '..', 'agente', 'agente.yaml'), 'utf8');
  assert.doesNotThrow(() => parseAgenteYaml(ok));
  assert.throws(() => parseAgenteYaml(ok.replace('campo: services', 'campo: {x: 1}')), /painel/);
  assert.throws(() => parseAgenteYaml(ok.replace('incluir_tipos: [topic, media]', 'incluir_tipos: [topic, foto]')), /incluir_tipos/);
  assert.throws(() => parseAgenteYaml(ok.replace('pausar_ia: false', 'pausar_ia: talvez')), /pausar_ia/);
});

test('system acima de AGENTE_SYSTEM_MAX_CHARS: volta ao prompt antigo (RAG) no turno', async () => {
  process.env.RAG_ENABLED = 'false';
  process.env.AGENTE_SYSTEM_MAX_CHARS = '1000';
  try {
    const h = criar();
    await h.svc.processMessageAndRespond(1, 7, 'Que horas abre?', true, true, IDS);
    assert.ok(h.embeddings() > 0, 'deveria ter caído no RAG antigo');
    assert.ok(h.entradas.length > 0, 'respondeu');
  } finally { delete process.env.AGENTE_SYSTEM_MAX_CHARS; }
});

test('OPENROUTER_PAYLOAD=yaml: v2 só nos turnos do agente.yaml', async () => {
  const { openrouterPayloadV2 } = require('../src/utils/agentFlags');
  process.env.OPENROUTER_PAYLOAD = 'yaml';
  try {
    assert.equal(openrouterPayloadV2(true), true);
    assert.equal(openrouterPayloadV2(false), false);
    process.env.RAG_ENABLED = 'test';
    const t = criar(FONE_TESTE); await t.svc.processMessageAndRespond(1, 7, 'Oi', true, true, IDS);
    const c = criar(FONE_CLIENTE); await c.svc.processMessageAndRespond(1, 8, 'Oi', true, true, IDS);
    assert.equal(t.extras[0]?.agenteYaml, true);
    assert.ok(!c.extras[0]?.agenteYaml);
    process.env.OPENROUTER_PAYLOAD = 'v1';
    assert.equal(openrouterPayloadV2(true), false, 'v1 = antigo sempre');
  } finally { delete process.env.OPENROUTER_PAYLOAD; }
});

test('agente.yaml: tipos errados (2ª passada do juiz) são recusados; o arquivo real passa', () => {
  const { parseAgenteYaml, loadAgenteYaml } = require('../src/services/agentePrompt');
  const base = fs.readFileSync(path.join(__dirname, '..', 'agente', 'agente.yaml'), 'utf8');
  assert.ok(loadAgenteYaml().versao >= 1);
  const troca = (de: string, para: string) => { assert.ok(base.includes(de), de); return base.replace(de, para); };
  assert.throws(() => parseAgenteYaml(troca('papel: "atendente virtual de WhatsApp"', 'papel: "  "')), /persona.papel/);
  assert.throws(() => parseAgenteYaml(troca('empresa_do_painel: true', 'empresa_do_painel: "sim"')), /empresa_do_painel/);
  assert.throws(() => parseAgenteYaml(troca('pular_vazios: true', 'pular_vazios: "false"')), /pular_vazios/);
  assert.throws(() => parseAgenteYaml(troca('  - id: R2\n    texto: "A resposta', '  - id: R2\n    texto: ""\n    x: "A resposta')), /regras/);
  assert.throws(() => parseAgenteYaml(base.replace(/contexto_do_turno:[\s\S]*$/, 'contexto_do_turno: texto\n')), /contexto_do_turno/);
});
