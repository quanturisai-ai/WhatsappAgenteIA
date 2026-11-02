// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/agente-tools.test.ts
process.env.TURN_METRICS = 'off'; // não gravar no logs/turnos.jsonl de produção
// Item 6 (etapa 5): ferramentas nativas, teto de chamadas, catálogo de mídias, pausa no handoff,
// simulação de ações e correção do media_id do RAG. Sem banco e sem rede.
process.env.AGENTE_TEST_NUMBERS = '5561900000001';
process.env.CONTATOIA_OWNER_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliarChamada, definicoesTools, loopFerramentas, midiaNoCatalogo, TEXTO_TETO,
} from '../src/services/agenteTools';
import { ConversationService } from '../src/services/conversation.service';
import { RAGService } from '../src/services/rag.service';
import { HumanAttendantService } from '../src/services/humanAttendant.service';
import { OpenRouterService } from '../src/services/openrouter.service';
import { VmLavClienteModel } from '../src/models/vmLavCliente.model';
import { loadAgenteYaml } from '../src/services/agentePrompt';

(VmLavClienteModel.prototype as any).findByTelefoneNormalized = async () => null;

const DONO = '5561900000001';
const CLIENTE = '5562988887777';
const ATENDENTE = '5561922220000';

const call = (name: string, args: any, id = 'c1') => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const CTX = { midiasCatalogo: new Set([2, 4]), contatoProativo: false };

function limparFlags() {
  for (const k of ['AGENTE_TOOLS', 'AGENTE_TOOLS_REGEX', 'AGENTE_TOOLS_MAX_CHAMADAS', 'CHAMAR_ATENDENTE_PAUSA',
    'AGENTE_ACOES_SIMULADAS', 'ENVIAR_MIDIA_CATALOGO', 'RAG_MIDIA_ID_FIX', 'RAG_ENABLED', 'OPENROUTER_PAYLOAD',
    'CONTATOIA_RESTRICT']) delete process.env[k];
}

// ---------------------------------------------------------------- loop (puro)

test('loop: só texto = 1 chamada, sem ações', async () => {
  let n = 0;
  const r = await loopFerramentas(async () => { n++; return { content: 'Olá!', toolCalls: [] }; }, [], CTX);
  assert.equal(r.texto, 'Olá!');
  assert.equal(r.chamadas, 1);
  assert.equal(n, 1);
  assert.deepEqual(r.acoes, []);
  assert.equal(r.estourou, false);
});

test('loop: ferramenta e depois texto; o resultado da ferramenta volta ao modelo', async () => {
  const vistas: any[][] = [];
  const respostas = [
    { content: null, toolCalls: [call('enviar_midia', { id: 4 }, 'a1')] },
    { content: 'Segue o vídeo!', toolCalls: [] },
  ];
  const r = await loopFerramentas(async (m) => { vistas.push(m); return respostas[vistas.length - 1]; }, [{ role: 'user', content: 'oi' }], CTX);
  assert.equal(r.texto, 'Segue o vídeo!');
  assert.equal(r.chamadas, 2);
  assert.deepEqual(r.acoes, [{ tipo: 'enviar_midia', id: 4 }]);
  const seg = vistas[1];
  assert.equal(seg[1].role, 'assistant');
  assert.equal(seg[1].tool_calls[0].id, 'a1');
  assert.equal(seg[2].role, 'tool');
  assert.equal(seg[2].tool_call_id, 'a1');
  assert.match(seg[2].content, /^ok/);
});

test('loop: teto de 3 chamadas; passou, chama atendente e responde texto de espera', async () => {
  let n = 0;
  const r = await loopFerramentas(async () => { n++; return { content: null, toolCalls: [call('enviar_midia', { id: 99 }, `x${n}`)] }; }, [], CTX, 3);
  assert.equal(n, 3, 'nunca mais de 3 chamadas ao LLM');
  assert.equal(r.estourou, true);
  assert.equal(r.texto, TEXTO_TETO);
  const alerta = r.acoes.find((a) => a.tipo === 'chamar_atendente') as any;
  assert.ok(alerta && alerta.automatico, 'atendente chamado automaticamente');
  assert.ok(!r.acoes.some((a) => a.tipo === 'enviar_midia'), 'mídia fora do catálogo não vira ação');
});

test('loop: sem texto e sem ferramenta = mesmo erro de antes (cai no fallback)', async () => {
  await assert.rejects(loopFerramentas(async () => ({ content: null, toolCalls: [] }), [], CTX), /não contém texto/);
});

test('loop: mesma mídia uma vez; um alerta só', async () => {
  const r = await loopFerramentas(async () => ({
    content: 'ok',
    toolCalls: [call('enviar_midia', { id: 2 }, 'a'), call('enviar_midia', { id: '2' }, 'b'),
      call('chamar_atendente', { motivo: 'm1', resumo: 'r' }, 'c'), call('chamar_atendente', { motivo: 'm2', resumo: 'r' }, 'd')],
  }), [], CTX);
  assert.deepEqual(r.acoes.map((a) => a.tipo), ['enviar_midia', 'chamar_atendente']);
  assert.equal((r.acoes[1] as any).motivo, 'm1');
});

test('avaliarChamada: ID fora do catálogo, motivo vazio, JSON quebrado e contato proativo sem permissão', () => {
  assert.match(avaliarChamada(call('enviar_midia', { id: 57 }), CTX).resultado, /^erro/);
  assert.equal(avaliarChamada(call('enviar_midia', { id: 57 }), CTX).acao, undefined);
  assert.equal(avaliarChamada(call('chamar_atendente', { motivo: ' ', resumo: 'x' }), CTX).acao, undefined);
  assert.equal(avaliarChamada({ function: { name: 'enviar_midia', arguments: '{quebrado' } }, CTX).acao, undefined);
  assert.equal(avaliarChamada(call('contato_proativo', { numero: '62955550000', mensagem: 'oi' }), CTX).acao, undefined);
  const ok = avaliarChamada(call('contato_proativo', { numero: '(62) 95555-0000', mensagem: 'oi' }), { ...CTX, contatoProativo: true });
  assert.deepEqual(ok.acao, { tipo: 'contato_proativo', numero: '62955550000', mensagem: 'oi' });
});

test('definicoesTools: contato_proativo só aparece para quem pode', () => {
  assert.deepEqual(definicoesTools([], { contatoProativo: false }).map((t) => t.function.name), ['enviar_midia', 'chamar_atendente']);
  assert.deepEqual(definicoesTools([], { contatoProativo: true }).map((t) => t.function.name), ['enviar_midia', 'chamar_atendente', 'contato_proativo']);
});

test('midiaNoCatalogo: foto recebida de cliente (incoming/inativa) e de outro usuário ficam fora', () => {
  assert.equal(midiaNoCatalogo({ user_id: 1, is_active: 1, status: 'completed', source: 'outgoing' }, 1), true);
  assert.equal(midiaNoCatalogo({ user_id: 1, is_active: 0, status: 'completed', source: 'incoming' }, 1), false);
  assert.equal(midiaNoCatalogo({ user_id: 1, is_active: 1, status: 'completed', source: 'incoming' }, 1), false);
  assert.equal(midiaNoCatalogo({ user_id: 2, is_active: 1, status: 'completed', source: 'outgoing' }, 1), false);
  assert.equal(midiaNoCatalogo({ user_id: 1, is_active: 1, status: 'processing', source: 'outgoing' }, 1), false);
  assert.equal(midiaNoCatalogo(null, 1), false);
});

// ---------------------------------------------------------------- RAGService (yaml + tools)

const PAINEL = { business_name: 'Lavanderia Teste', personality: 'Você é Maria.', business_info: 'x', services: 'y', hours: 'z', specific_instructions: null };
const MIDIAS = [
  { id: 4, title: 'Vídeo', description: 'Interior', file_type: 'video', is_active: true, status: 'completed', source: 'outgoing' },
  { id: 2, title: 'Foto', description: 'Fachada', file_type: 'image', is_active: true, status: 'completed', source: 'outgoing' },
];

function criarRag(fone: string, respostas: Array<{ content: string | null; toolCalls: any[] }>) {
  const svc: any = new RAGService();
  const chamadas: any[] = [];
  const textoSimples: any[] = [];
  svc.agentConfigModel = { findByUserId: async () => ({ ...PAINEL, max_age_hours: 12 }) };
  svc.conversationModel = { findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, contact_name: 'Ana', last_message_at: new Date() }) };
  svc.messageModel = { findByConversationId: async () => [], findLastClientMessage: async () => null };
  svc.topicModel = { findByUserId: async () => [], findActiveByUserId: async () => [], findByTriggerKeywords: async () => [] };
  svc.mediaModel = { findByUserId: async () => MIDIAS, findByKeywords: async () => [] };
  svc.chromaService = { query: async () => [] };
  svc.ollamaService = {
    generateEmbedding: async () => [0.1],
    generateResponse: async (input: any) => { textoSimples.push(input); return 'Resposta sem tools.'; },
    generateWithTools: async (msgs: any[], _m: any, _o: any, extra: any, tools: any[]) => {
      chamadas.push({ msgs, extra, tools });
      return respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
    },
  };
  return { svc, chamadas, textoSimples };
}
const IDS = () => ({ batchDbIds: [3], batchMessageIds: ['w3'] } as any);

test('AGENTE_TOOLS off (padrão): yaml igual ao de antes, sem tools, sem seção FERRAMENTAS', async () => {
  limparFlags();
  process.env.RAG_ENABLED = 'false';
  process.env.OPENROUTER_PAYLOAD = 'v2';
  const h = criarRag(DONO, []);
  const b = IDS();
  const r = await h.svc.processMessageAndRespond(1, 7, 'Oi', true, true, b);
  assert.equal(r, 'Resposta sem tools.');
  assert.equal(h.chamadas.length, 0);
  assert.equal(b.ferramentas, undefined);
  assert.ok(!h.textoSimples[0][0].content.includes('# FERRAMENTAS'));
  assert.match(h.textoSimples[0][0].content, /\[ENVIAR_MIDIA/, 'instruções antigas de comando no texto continuam');
  limparFlags();
});

test('AGENTE_TOOLS=test: só o número de teste; cliente segue no modo antigo', async () => {
  limparFlags();
  process.env.RAG_ENABLED = 'false';
  process.env.OPENROUTER_PAYLOAD = 'v2';
  process.env.AGENTE_TOOLS = 'test';
  const t = criarRag(DONO, [{ content: null, toolCalls: [call('enviar_midia', { id: 2 })] }, { content: 'Aqui a foto.', toolCalls: [] }]);
  const bt = IDS();
  const rt = await t.svc.processMessageAndRespond(1, 7, 'Manda foto', true, true, bt);
  assert.equal(rt, 'Aqui a foto.');
  assert.equal(t.chamadas.length, 2);
  assert.deepEqual(bt.ferramentas.acoes, [{ tipo: 'enviar_midia', id: 2 }]);
  const sys = t.chamadas[0].msgs[0].content as string;
  assert.ok(sys.includes('# FERRAMENTAS'));
  assert.ok(sys.includes('envie com a ferramenta enviar_midia'));
  assert.deepEqual(t.chamadas[0].tools.map((x: any) => x.function.name), ['enviar_midia', 'chamar_atendente']);
  assert.equal(t.chamadas[0].extra.agenteYaml, true);

  const c = criarRag(CLIENTE, []);
  const bc = IDS();
  assert.equal(await c.svc.processMessageAndRespond(1, 8, 'Manda foto', true, true, bc), 'Resposta sem tools.');
  assert.equal(c.chamadas.length, 0);
  assert.equal(bc.ferramentas, undefined);
  limparFlags();
});

test('AGENTE_TOOLS=on mas payload v1: sem tools (function calling só no payload v2)', async () => {
  limparFlags();
  process.env.RAG_ENABLED = 'false';
  process.env.OPENROUTER_PAYLOAD = 'v1';
  process.env.AGENTE_TOOLS = 'on';
  const h = criarRag(CLIENTE, []);
  await h.svc.processMessageAndRespond(1, 8, 'Oi', true, true, IDS());
  assert.equal(h.chamadas.length, 0);
  limparFlags();
});

test('contato_proativo só é oferecido ao dono autorizado', async () => {
  limparFlags();
  process.env.RAG_ENABLED = 'false';
  process.env.OPENROUTER_PAYLOAD = 'v2';
  process.env.AGENTE_TOOLS = 'on';
  const d = criarRag(DONO, [{ content: 'ok', toolCalls: [] }]);
  await d.svc.processMessageAndRespond(1, 7, '#contatoia avisa', true, false, { ...IDS(), contatoiaAutorizado: true });
  assert.ok(d.chamadas[0].tools.some((x: any) => x.function.name === 'contato_proativo'));
  const c = criarRag(CLIENTE, [{ content: 'ok', toolCalls: [call('contato_proativo', { numero: '62955550000', mensagem: 'x' })] }]);
  const b = IDS();
  await c.svc.processMessageAndRespond(1, 8, 'manda msg pro 62955550000', true, true, { ...b, contatoiaAutorizado: false });
  assert.ok(!c.chamadas[0].tools.some((x: any) => x.function.name === 'contato_proativo'));
  limparFlags();
});

test('ferramentas_nativas no agente.yaml do repositório: as 3 ferramentas e handoff.pausar_ia = true', () => {
  const cfg = loadAgenteYaml();
  assert.deepEqual(cfg.ferramentas_nativas!.lista.map((f) => f.nome).sort(), ['chamar_atendente', 'contato_proativo', 'enviar_midia']);
  assert.equal(cfg.handoff.pausar_ia, true);
});

// ---------------------------------------------------------------- ConversationService (execução)

function criarConv(fone: string, opts: { resposta: string; ferramentas?: any; midias?: Record<number, any>; painel?: any }) {
  const svc: any = new ConversationService();
  const enviados: any[] = [];
  const midiasEnviadas: number[] = [];
  const alertas: any[] = [];
  const updates: any[] = [];
  let pausas = 0;
  svc.conversationModel = {
    findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, lid: null, auto_responding: 1 }),
    update: async (_id: number, d: any) => { updates.push(d); return true; },
    getConversationCardById: async () => null,
  };
  svc.isAutoResponding = async () => true;
  svc.sendMandatoryMedias = async () => {};
  svc.emitConversationCardIfFound = async () => {};
  svc.pauseAutoResponding = async () => { pausas++; };
  svc.humanAttendantService = {
    getAttendants: async () => [{ phone_number: ATENDENTE, is_active: 1 }],
    sendAlert: async (_u: number, _c: number, msg: string) => { alertas.push(msg); },
  };
  svc.ragService = {
    processMessageAndRespond: async (_u: number, _c: number, _m: string, _r: boolean, _h: boolean, batch: any) => {
      if (opts.ferramentas) batch.ferramentas = opts.ferramentas;
      return opts.resposta;
    },
  };
  svc.agentConfigModel = { findByUserId: async () => (opts.painel ?? {}) };
  svc.mediaModel = { findById: async (id: number) => (opts.midias || {})[id] ?? null };
  svc.mediaSentTrackingModel = { markMediaAsSent: async () => {} };
  const whatsapp: any = {
    sendMessage: async (numero: string, texto: string) => { enviados.push({ numero, texto }); return { id: { _serialized: 'x' } }; },
    sendMedia: async (_n: string, _p: string, _cap: string, _a: boolean, mediaId: number) => { midiasEnviadas.push(mediaId); return {}; },
  };
  return { svc, whatsapp, enviados, midiasEnviadas, alertas, updates, pausas: () => pausas };
}

const FOTO_CLIENTE = { id: 57, user_id: 1, title: 'foto de cliente', file_path: 'x', is_active: 0, status: 'completed', source: 'incoming' };
const FOTO_CATALOGO = { id: 2, user_id: 1, title: 'fachada', file_path: 'y', is_active: 1, status: 'completed', source: 'outgoing' };

test('ENVIAR_MIDIA_CATALOGO=on: [ENVIAR_MIDIA:57] de foto de cliente NÃO é enviado (antes era)', async () => {
  limparFlags();
  const midias = { 57: FOTO_CLIENTE, 2: FOTO_CATALOGO };
  const antes = criarConv(CLIENTE, { resposta: 'Veja [ENVIAR_MIDIA:57] [ENVIAR_MIDIA:2]', midias });
  await antes.svc.processIncomingMessage(1, 8, 'manda foto', antes.whatsapp);
  assert.deepEqual(antes.midiasEnviadas, [57, 2], 'off = comportamento antigo (risco documentado)');

  process.env.ENVIAR_MIDIA_CATALOGO = 'on';
  const depois = criarConv(CLIENTE, { resposta: 'Veja [ENVIAR_MIDIA:57] [ENVIAR_MIDIA:2]', midias });
  await depois.svc.processIncomingMessage(1, 8, 'manda foto', depois.whatsapp);
  assert.deepEqual(depois.midiasEnviadas, [2]);
  limparFlags();
});

test('ações nativas: mídia + alerta executados; comando no texto continua valendo como reserva', async () => {
  limparFlags();
  process.env.ENVIAR_MIDIA_CATALOGO = 'on';
  const h = criarConv(CLIENTE, {
    resposta: 'Segue a foto. [ENVIAR_MIDIA:4]',
    midias: { 2: FOTO_CATALOGO, 4: { ...FOTO_CATALOGO, id: 4 } },
    ferramentas: { acoes: [{ tipo: 'enviar_midia', id: 2 }, { tipo: 'chamar_atendente', motivo: 'Cliente quer cancelar.', resumo: 'Quer cancelar o plano' }], chamadas: 2, estourou: false },
  });
  await h.svc.processIncomingMessage(1, 8, 'oi', h.whatsapp);
  assert.deepEqual(h.midiasEnviadas, [2, 4]);
  assert.deepEqual(h.alertas, ['Cliente quer cancelar. Resumo: Quer cancelar o plano']);
  assert.ok(h.updates.some((u) => u.needs_intervention === true));
  assert.equal(h.pausas(), 0, 'CHAMAR_ATENDENTE_PAUSA off = não pausa (antigo)');
  limparFlags();
});

test('AGENTE_TOOLS_REGEX=off: com tools, o comando no texto é só apagado', async () => {
  limparFlags();
  process.env.AGENTE_TOOLS_REGEX = 'off';
  const h = criarConv(CLIENTE, {
    resposta: 'Oi! [ENVIAR_MIDIA:2] [ALERTAR_ATENDENTE: x. Resumo: y]',
    midias: { 2: FOTO_CATALOGO },
    ferramentas: { acoes: [], chamadas: 1, estourou: false },
  });
  await h.svc.processIncomingMessage(1, 8, 'oi', h.whatsapp);
  assert.deepEqual(h.midiasEnviadas, []);
  assert.deepEqual(h.alertas, []);
  assert.ok(h.enviados.some((e) => e.numero === CLIENTE && !e.texto.includes('[')), 'texto sai limpo');
  limparFlags();
});

test('CHAMAR_ATENDENTE_PAUSA: pausa só com flag + yaml + painel permitindo', async () => {
  limparFlags();
  const fer = () => ({ acoes: [{ tipo: 'chamar_atendente', motivo: 'm', resumo: 'r' }], chamadas: 1, estourou: false });
  const rodar = async (fone: string, painel: any) => {
    const h = criarConv(fone, { resposta: 'Já chamei.', ferramentas: fer(), painel });
    await h.svc.processIncomingMessage(1, 7, 'quero falar com humano', h.whatsapp);
    return h.pausas();
  };
  process.env.CHAMAR_ATENDENTE_PAUSA = 'test';
  assert.equal(await rodar(DONO, {}), 1, 'número de teste: pausa');
  assert.equal(await rodar(CLIENTE, {}), 0, 'cliente no modo test: não pausa');
  assert.equal(await rodar(DONO, { pause_on_human_reply: 0 }), 0, 'painel com pausa desligada: não pausa');
  process.env.CHAMAR_ATENDENTE_PAUSA = 'on';
  assert.equal(await rodar(CLIENTE, {}), 1);
  limparFlags();
});

test('teto estourado: texto de espera vai ao cliente e o atendente é chamado', async () => {
  limparFlags();
  const h = criarConv(CLIENTE, {
    resposta: TEXTO_TETO,
    ferramentas: { acoes: [{ tipo: 'chamar_atendente', motivo: 'a IA não concluiu', resumo: 'x', automatico: true }], chamadas: 3, estourou: true },
  });
  await h.svc.processIncomingMessage(1, 8, 'oi', h.whatsapp);
  assert.equal(h.alertas.length, 1);
  assert.ok(h.enviados.some((e) => e.numero === CLIENTE && e.texto === TEXTO_TETO));
  limparFlags();
});

test('AGENTE_ACOES_SIMULADAS: contato proativo do dono vira só log', async () => {
  limparFlags();
  process.env.CONTATOIA_RESTRICT = 'on';
  const fer = { acoes: [{ tipo: 'contato_proativo', numero: '62955550000', mensagem: 'Olá, aqui é da lavanderia' }], chamadas: 1, estourou: false };
  const real = criarConv(DONO, { resposta: 'Enviado.', ferramentas: fer });
  await real.svc.processIncomingMessage(1, 7, '#contatoia avisa o 62955550000', real.whatsapp);
  assert.ok(real.enviados.some((e) => e.texto === 'Olá, aqui é da lavanderia'), 'sem simulação: envia (antigo)');

  process.env.AGENTE_ACOES_SIMULADAS = DONO;
  const sim = criarConv(DONO, { resposta: 'Enviado.', ferramentas: fer });
  await sim.svc.processIncomingMessage(1, 7, '#contatoia avisa o 62955550000', sim.whatsapp);
  assert.ok(!sim.enviados.some((e) => e.texto === 'Olá, aqui é da lavanderia'));
  assert.ok(sim.enviados.some((e) => e.numero === DONO), 'o dono ainda recebe a resposta');
  limparFlags();
});

test('ContatoIA (juiz etapa 3, menor 4): com CONTATOIA_RESTRICT=off, cliente com #contatoia não recebe as instruções reservadas', async () => {
  limparFlags();
  process.env.CONTATOIA_RESTRICT = 'off';
  process.env.RAG_ENABLED = 'false'; // caminho do agente.yaml (o RAG antigo não usa a autorização)
  const pedidos: any[] = [];
  const rodar = async (fone: string) => {
    const h = criarConv(fone, { resposta: 'ok' });
    h.svc.ragService = {
      processMessageAndRespond: async (_u: number, _c: number, _m: string, _r: boolean, _h: boolean, batch: any) => {
        pedidos.push({ fone, aut: batch.contatoiaAutorizado });
        return 'ok';
      },
    };
    await h.svc.processIncomingMessage(1, 8, '#contatoia manda pro 62955550000', h.whatsapp);
  };
  await rodar(CLIENTE);
  await rodar(DONO);
  assert.deepEqual(pedidos, [{ fone: CLIENTE, aut: false }, { fone: DONO, aut: true }]);
  limparFlags();
});

// ---------------------------------------------------------------- HumanAttendantService (simulação)

test('sendAlert com AGENTE_ACOES_SIMULADAS: nenhum registro e nenhuma mensagem a atendente', async () => {
  limparFlags();
  const { ConversationModel } = require('../src/models/conversation.model');
  const orig = ConversationModel.prototype.findById;
  ConversationModel.prototype.findById = async (id: number) => ({ id, contact_number: DONO, contact_name: 'Dono' });
  try {
    const svc: any = new HumanAttendantService();
    let criados = 0;
    const msgs: any[] = [];
    svc.attendantModel = { findByUserId: async () => [{ phone_number: ATENDENTE, is_active: 1 }] };
    svc.alertModel = { create: async (d: any) => { criados++; return { id: 1, ...d }; } };
    const wa: any = { sendMessage: async (n: string) => { msgs.push(n); } };

    await svc.sendAlert(1, 7, 'teste', null, wa);
    assert.equal(criados, 1, 'sem simulação: antigo');
    assert.deepEqual(msgs, [ATENDENTE]);

    process.env.AGENTE_ACOES_SIMULADAS = DONO;
    const r = await svc.sendAlert(1, 7, 'teste', null, wa);
    assert.equal(criados, 1, 'simulado: nada gravado');
    assert.deepEqual(msgs, [ATENDENTE], 'simulado: nada enviado à atendente');
    assert.equal(r.id, 0);

    process.env.AGENTE_ACOES_SIMULADAS = '5561999999999';
    await svc.sendAlert(1, 7, 'teste', null, wa);
    assert.equal(criados, 2, 'outro número na lista: alerta normal');
  } finally {
    ConversationModel.prototype.findById = orig;
    limparFlags();
  }
});

// ---------------------------------------------------------------- RAG: media_id

test('RAG_MIDIA_ID_FIX=on: mídia indexada só com metadata.id aparece; foto de cliente não', async () => {
  limparFlags();
  const svc: any = new RAGService();
  const banco: Record<number, any> = {
    10: { id: 10, user_id: 1, title: 'Catálogo', description: 'x', file_type: 'image', is_active: 1, status: 'completed', source: 'outgoing' },
    57: FOTO_CLIENTE,
  };
  svc.mediaModel = { findById: async (id: number) => banco[id] ?? null };
  const vet = [
    { id: 'media_10', text: 't', distance: 0.2, metadata: { type: 'media', id: 10 } },
    { id: 'media_57', text: 't', distance: 0.1, metadata: { type: 'media', id: 57 } },
  ];
  const antes = await svc.rankMedias([], vet, 1);
  assert.equal(antes.length, 0, 'off = antigo: sem media_id a mídia some');
  process.env.RAG_MIDIA_ID_FIX = 'on';
  const depois = await svc.rankMedias([], vet, 1);
  assert.deepEqual(depois.map((r: any) => r.id), ['media_10']);
  assert.equal(depois[0].metadata.media_id, 10);
  limparFlags();
});

// ---------------------------------------------------------------- OpenRouter: corpo HTTP (juiz etapa 3, menor 5)

function orComPost(resposta: any) {
  const svc: any = new OpenRouterService();
  const corpos: any[] = [];
  svc.axiosInstance = { post: async (_u: string, body: any) => { corpos.push(JSON.parse(JSON.stringify(body))); return { data: resposta }; } };
  return { svc, corpos };
}

test('HTTP: OPENROUTER_PAYLOAD=yaml manda v2 só no turno do yaml; tools vão no corpo', async () => {
  limparFlags();
  process.env.OPENROUTER_PAYLOAD = 'yaml';
  const msgs = [{ role: 'system', content: 's' }, { role: 'user', content: 'oi' }];
  const opts: any = { temperature: 0.2, top_p: 0.5, top_k: 100, repeat_penalty: 1 };
  const okTxt = { choices: [{ message: { content: 'Oi!' } }] };

  const a = orComPost(okTxt);
  assert.equal(await a.svc.generateResponse(msgs, undefined, 'm', opts, { agenteYaml: true, sessionId: 'conv-7' }), 'Oi!');
  assert.equal(a.corpos[0].session_id, 'conv-7');
  assert.equal(a.corpos[0].top_k, undefined, 'v2');
  assert.equal(a.corpos[0].tools, undefined, 'sem tools no caminho de texto');

  const b = orComPost(okTxt);
  await b.svc.generateResponse(msgs, undefined, 'm', opts, { sessionId: 'conv-8' });
  assert.equal(b.corpos[0].top_k, 100, 'cliente fora do yaml: v1');
  assert.equal(b.corpos[0].session_id, undefined);

  const c = orComPost(okTxt);
  await c.svc.generateResponse('pergunta', 'contexto', 'm', opts);
  assert.equal(c.corpos[0].top_k, 100, 'fallback (prompt em texto): v1');

  const tools = definicoesTools([], { contatoProativo: false });
  const d = orComPost({ choices: [{ message: { content: null, tool_calls: [call('enviar_midia', { id: 2 })] } }] });
  const r = await d.svc.generateWithTools(
    [...msgs, { role: 'assistant', content: null, tool_calls: [call('enviar_midia', { id: 9 }, 'z')] }, { role: 'tool', tool_call_id: 'z', content: 'erro' }],
    'm', opts, { agenteYaml: true }, tools);
  assert.deepEqual(d.corpos[0].tools.map((t: any) => t.function.name), ['enviar_midia', 'chamar_atendente']);
  assert.equal(d.corpos[0].tool_choice, 'auto');
  assert.equal(d.corpos[0].messages[2].tool_calls[0].id, 'z');
  assert.equal(d.corpos[0].messages[3].tool_call_id, 'z');
  assert.equal(r.content, null);
  assert.equal(r.toolCalls.length, 1);

  const e = orComPost({ choices: [{ message: { content: '', tool_calls: [call('enviar_midia', { id: 2 })] } }] });
  await assert.rejects(e.svc.generateResponse(msgs, undefined, 'm', opts, { agenteYaml: true }), /não contém texto/,
    'sem tools pedidas, tool_calls na resposta não contam (antigo)');
  limparFlags();
});
