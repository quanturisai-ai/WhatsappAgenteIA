// Roda com: TURN_METRICS=off node --test-force-exit -r ts-node/register/transpile-only --test tests/midia-turno.test.ts
// Item 5 (02/11/2026): multimodal (foto/vídeo do turno ao modelo), descrição para o histórico,
// vídeo grande = "[vídeo recebido]" + atendente, data_collection deny, log sem base64.
//
// A parte "pelo RAGService" reprova no código antigo: lá AGENTE_MULTIMODAL é ignorado (modelo do
// painel, só texto "[media]", sem data_collection, sem alerta de vídeo grande).
process.env.TURN_METRICS = 'off';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';
process.env.HISTORY_MESSAGES = 'on';
process.env.RAG_ENABLED = 'false';
process.env.OPENROUTER_PAYLOAD = 'v2';
process.env.OPENROUTER_PROVIDER_MODE = 'default';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import pool from '../src/config/database';
import { RAGService } from '../src/services/rag.service';
import { OpenRouterService } from '../src/services/openrouter.service';
import { VmLavClienteModel } from '../src/models/vmLavCliente.model';
import { renderForLog } from '../src/services/chatHistory';
import {
  aplicarMidiasNoHistorico,
  carregarMidiasDoLote,
  conteudoDoTurno,
  limitesDoEnv,
  garantirAlertaVideo,
  linhaMidia,
  normalizarDescricao,
  planejarMidias,
  semBase64,
  tamanhoDataUrl,
} from '../src/services/midiaTurno';
import { deveDescreverMidia, modelAcceptsMedia, multimodalAppliesTo, multimodalModel } from '../src/utils/agentFlags';

(VmLavClienteModel.prototype as any).findByTelefoneNormalized = async () => null;

const FONE_TESTE = '5561900000001';
const FONE_CLIENTE = '5562988887777';
const MB = 1_000_000;
const GEMINI = 'google/gemini-2.5-flash-lite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midia-turno-'));
process.env.MIDIA_DIR_INCOMING = dir; // só arquivos daqui vão ao provedor
const em = (nome: string) => path.join(dir, nome);
const arquivo = (nome: string, bytes: number) => {
  const p = path.join(dir, nome);
  fs.writeFileSync(p, Buffer.alloc(bytes, 7));
  return p;
};
const FOTO = arquivo('painel.jpg', 3000);
const VIDEO = arquivo('curto.mp4', 9000);
const GIF = arquivo('anim.gif', 500);

const LIMITES = { imagemMaxBytes: 7 * MB, videoMaxBytes: 14 * MB, maxPorTurno: 4, orcamentoBytes: 18_900_000 };
const arq = (mediaId: number, filePath: string, fileType: string, fileSize: number) => ({ messageDbId: mediaId, mediaId, filePath, fileType, fileSize });
const lerFalso = (bytes: number) => () => Buffer.alloc(bytes, 1);

// ---------------------------------------------------------------- funções puras

test('planejarMidias: foto vira image_url e vídeo curto vira video_url (data URL), na ordem do lote', () => {
  const plano = planejarMidias([arq(1, FOTO, 'image', 3000), arq(2, VIDEO, 'video', 9000)], LIMITES, (p) => fs.readFileSync(p));
  assert.equal(plano.partes.length, 2);
  assert.equal(plano.partes[0].type, 'image_url');
  assert.match((plano.partes[0] as any).image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(plano.partes[1].type, 'video_url');
  assert.match((plano.partes[1] as any).video_url.url, /^data:video\/mp4;base64,/);
  assert.deepEqual(plano.videosGrandes, []);
});

test('planejarMidias: vídeo acima do limite ou que estoura o corpo máximo não vai (vira vídeo grande)', () => {
  let leituras = 0;
  const grande = planejarMidias([arq(5, em('grande.mp4'), 'video', 15 * MB)], LIMITES, () => { leituras++; return Buffer.alloc(1); });
  assert.equal(leituras, 0, 'não lê o arquivo grande');
  assert.equal(grande.partes.length, 0);
  assert.deepEqual(grande.videosGrandes.map((v) => v.mediaId), [5]);
  // 13 MB cabe no limite de vídeo, mas 2 deles estouram o corpo (base64 = 4/3)
  const dois = planejarMidias([arq(6, em('a.mp4'), 'video', 13 * MB), arq(7, em('b.mp4'), 'video', 13 * MB)], LIMITES, lerFalso(13 * MB));
  assert.equal(dois.partes.length, 1);
  assert.deepEqual(dois.videosGrandes.map((v) => v.mediaId), [7]);
  assert.ok(tamanhoDataUrl(13 * MB, 'video/mp4') > 13 * MB * 1.33);
});

test('planejarMidias: GIF/áudio/documento, limite por turno e erro de leitura não derrubam', () => {
  const plano = planejarMidias(
    [arq(1, GIF, 'image', 500), arq(2, em('x.ogg'), 'audio', 100), arq(3, em('x.pdf'), 'document', 100), arq(4, em('sumiu.jpg'), 'image', 100)],
    LIMITES,
    (p) => fs.readFileSync(p)
  );
  assert.equal(plano.partes.length, 0);
  assert.deepEqual(plano.fotosNaoVistas.map((f) => f.motivo), ['formato', 'leitura']);
  const cinco = planejarMidias([1, 2, 3, 4, 5].map((i) => arq(i, em(`f${i}.png`), 'image', 10)), { ...LIMITES, maxPorTurno: 4 }, lerFalso(10));
  assert.equal(cinco.partes.length, 4);
  assert.deepEqual(cinco.fotosNaoVistas.map((f) => f.motivo), ['limite_por_turno']);
});

test('limites do .env: vídeo de 14 MB (padrão) cabe no corpo; acima disso vira vídeo grande', () => {
  for (const k of ['MIDIA_VIDEO_MAX_MB', 'MIDIA_MAX_REQUEST_BYTES', 'MIDIA_IMAGEM_MAX_MB', 'MIDIA_MAX_POR_TURNO']) delete process.env[k];
  const lim = limitesDoEnv(60_000); // system de ~35 mil caracteres + histórico
  const cabe = planejarMidias([arq(1, em('v14.mp4'), 'video', 14 * MB)], lim, lerFalso(14 * MB));
  assert.equal(cabe.partes.length, 1, '14 MB tem que ir ao modelo');
  const passa = planejarMidias([arq(2, em('v14b.mp4'), 'video', 14 * MB + 1)], lim, lerFalso(14 * MB + 1));
  assert.deepEqual(passa.videosGrandes.map((v) => v.mediaId), [2]);
});

test('arquivo fora de uploads/incoming nunca é lido nem enviado', () => {
  let leituras = 0;
  const plano = planejarMidias([arq(1, '/etc/passwd.jpg', 'image', 100), arq(2, path.join(dir, '..', 'fora.jpg'), 'image', 100)], LIMITES, () => { leituras++; return Buffer.alloc(100); });
  assert.equal(leituras, 0);
  assert.equal(plano.partes.length, 0);
  assert.deepEqual(plano.fotosNaoVistas.map((f) => f.motivo), ['leitura', 'leitura']);
});

test('vídeo que não abre (formato) chama o atendente sem dizer que é grande', () => {
  const plano = planejarMidias([arq(3, em('clip.mov.bin'), 'video', 2000)], LIMITES, lerFalso(2000));
  assert.deepEqual(plano.videosGrandes, []);
  assert.deepEqual(plano.videosNaoVistos.map((v) => v.motivo), ['formato']);
  assert.match(conteudoDoTurno('x', plano) as string, /\[vídeo recebido\] \(1 vídeo\(s\) que você não consegue abrir/);
  const r = garantirAlertaVideo('ok', plano);
  assert.match(r, /\[ALERTAR_ATENDENTE: Cliente enviou 1 vídeo\(s\) que a IA não conseguiu abrir/);
  assert.ok(!/grande demais/.test(r));
});

test('conteudoDoTurno: texto primeiro (contexto + mensagem + aviso das mídias) e depois os anexos', () => {
  const plano = planejarMidias([arq(1, FOTO, 'image', 3000)], LIMITES, (p) => fs.readFileSync(p));
  const c = conteudoDoTurno('[contexto]\n\n[media]', plano) as any[];
  assert.ok(Array.isArray(c));
  assert.equal(c[0].type, 'text');
  assert.match(c[0].text, /^\[contexto\]\n\n\[media\]\n\n\[o cliente enviou 1 foto\(s\)/);
  assert.equal(c[1].type, 'image_url');
  // sem mídia anexada: continua string
  const so = conteudoDoTurno('oi', planejarMidias([], LIMITES, lerFalso(1)));
  assert.equal(so, 'oi');
});

test('vídeo grande: aviso no texto e alerta ao atendente acrescentado só se o modelo não chamou', () => {
  const plano = planejarMidias([arq(9, '/g.mp4', 'video', 28 * MB)], LIMITES, lerFalso(1));
  const texto = conteudoDoTurno('msg', plano);
  assert.equal(typeof texto, 'string');
  assert.match(texto as string, /\[vídeo recebido\] \(28\.0 MB/);
  const r = garantirAlertaVideo('Vou chamar um atendente.', plano);
  assert.match(r, /\n\[ALERTAR_ATENDENTE: Cliente enviou vídeo grande demais/);
  const ja = 'Ok [ALERTAR_ATENDENTE: vídeo do cliente]';
  assert.equal(garantirAlertaVideo(ja, plano), ja);
  assert.equal(garantirAlertaVideo('oi', planejarMidias([], LIMITES, lerFalso(1))), 'oi');
});

test('histórico: mídia antiga vira 1 linha com código de erro e máquina; sem descrição, rótulo curto', () => {
  const d = normalizarDescricao({ tipo: 'painel', descricao: 'Painel da secadora\ncom erro', texto_visivel: 'E21', codigo_erro: 'E21', numero_maquina: '03' })!;
  assert.equal(linhaMidia('image', d), '[foto do cliente: Painel da secadora com erro | código de erro: E21 | máquina: 03]');
  assert.equal(linhaMidia('image', { ...d, texto_visivel: 'E21 SALDO INSUFICIENTE' }),
    '[foto do cliente: Painel da secadora com erro | código de erro: E21 | máquina: 03 | texto: E21 SALDO INSUFICIENTE]');
  assert.equal(linhaMidia('video', null), '[vídeo recebido]');
  assert.equal(linhaMidia('image', undefined), '[foto recebida]');
  assert.equal(normalizarDescricao({ descricao: '' }), null);
  const rows = aplicarMidiasNoHistorico(
    [{ id: 1, content: '[media]', media_id: 10 }, { id: 2, content: 'deu erro', media_id: 11 }, { id: 3, content: 'oi' }],
    new Map([[1, { fileType: 'image', descricao: d }], [2, { fileType: 'video' }]])
  );
  assert.equal(rows[0].content, '[foto do cliente: Painel da secadora com erro | código de erro: E21 | máquina: 03]');
  assert.equal(rows[1].content, '[vídeo recebido]\ndeu erro');
  assert.equal(rows[2].content, 'oi');
  // áudio: o conteúdo é a transcrição e fica igual
  const audio = aplicarMidiasNoHistorico([{ id: 5, content: 'a secadora parou', media_id: 12 }], new Map([[5, { fileType: 'audio' }]]));
  assert.equal(audio[0].content, 'a secadora parou');
  assert.ok(!rows[0].content!.includes('\n'));
});

test('log: base64 nunca aparece (payload e renderForLog)', () => {
  const plano = planejarMidias([arq(1, FOTO, 'image', 3000)], LIMITES, (p) => fs.readFileSync(p));
  const msgs = [{ role: 'user', content: conteudoDoTurno('texto', plano) }];
  const red = JSON.stringify(semBase64({ messages: msgs }));
  assert.ok(!/base64,[A-Za-z0-9+/]{20}/.test(red), red);
  assert.match(red, /data:image\/jpeg;base64,<3000 bytes>/);
  const log = renderForLog(msgs as any);
  assert.ok(!log.includes('base64'), log);
  assert.match(log, /texto[\s\S]*\[foto anexada\]/);
});

test('flags: off/test/on, modelo do .env e prefixos multimodais', () => {
  delete process.env.AGENTE_MULTIMODAL;
  assert.equal(multimodalAppliesTo(FONE_TESTE), false);
  process.env.AGENTE_MULTIMODAL = 'test';
  assert.equal(multimodalAppliesTo(FONE_TESTE), true);
  assert.equal(multimodalAppliesTo(FONE_CLIENTE), false);
  process.env.AGENTE_MULTIMODAL = 'on';
  assert.equal(multimodalAppliesTo(FONE_CLIENTE), true);
  assert.equal(modelAcceptsMedia(GEMINI), true);
  assert.equal(modelAcceptsMedia('deepseek/deepseek-v4-flash'), false);
  const antes = process.env.OPENROUTER_GENERATION_MODEL;
  process.env.OPENROUTER_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';
  assert.equal(deveDescreverMidia(FONE_CLIENTE), false); // volta pelo modelo: nada de mídia
  process.env.OPENROUTER_GENERATION_MODEL = GEMINI;
  assert.equal(multimodalModel(), GEMINI);
  assert.equal(deveDescreverMidia(FONE_CLIENTE), true);
  process.env.MIDIA_DESCRICAO = 'off';
  assert.equal(deveDescreverMidia(FONE_CLIENTE), false);
  delete process.env.MIDIA_DESCRICAO;
  process.env.AGENTE_MULTIMODAL = 'off';
  assert.equal(deveDescreverMidia(FONE_CLIENTE), false);
  if (antes === undefined) delete process.env.OPENROUTER_GENERATION_MODEL; else process.env.OPENROUTER_GENERATION_MODEL = antes;
});

// ---------------------------------------------------------------- OpenRouterService (payload)

function openrouterFalso(respostas: Array<() => any>) {
  const svc: any = new OpenRouterService();
  const corpos: any[] = [];
  let i = 0;
  svc.axiosInstance = {
    post: async (_url: string, body: any) => {
      corpos.push(body);
      const r = respostas[Math.min(i++, respostas.length - 1)];
      return r();
    },
  };
  return { svc, corpos };
}
const ok = () => ({ data: { model: GEMINI, choices: [{ message: { content: 'ok' } }] } });
const erro429 = () => { const e: any = new Error('Request failed with status code 429'); e.response = { status: 429, data: {} }; throw e; };

test('OpenRouter: data_collection deny só no caminho multimodal; sem ele, payload igual ao antigo', async () => {
  const a = openrouterFalso([ok]);
  await a.svc.generateResponse([{ role: 'user', content: 'oi' }], undefined, 'm', {}, { sessionId: 'conv-1', agenteYaml: true });
  assert.equal(a.corpos[0].provider, undefined); // PROVIDER_MODE=default e sem multimodal: sem provider
  const b = openrouterFalso([ok]);
  await b.svc.generateResponse([{ role: 'user', content: [{ type: 'text', text: 'oi' }] }], undefined, GEMINI, {}, { agenteYaml: true, dataCollection: 'deny', temMidia: true });
  assert.deepEqual(b.corpos[0].provider, { data_collection: 'deny' });
  assert.ok(Array.isArray(b.corpos[0].messages[0].content));
  // v1 + sort: preserva o sort e acrescenta a política
  process.env.OPENROUTER_PAYLOAD = 'v1';
  const c = openrouterFalso([ok]);
  await c.svc.generateResponse([{ role: 'user', content: 'oi' }], undefined, GEMINI, {}, { dataCollection: 'deny' });
  assert.deepEqual(c.corpos[0].provider, { sort: 'throughput', data_collection: 'deny' });
  process.env.OPENROUTER_PAYLOAD = 'v2';
});

test('OpenRouter: 429 com mídia tenta de novo 1 vez; sem mídia não muda (erro direto)', async () => {
  const a = openrouterFalso([erro429, ok]);
  assert.equal(await a.svc.generateResponse([{ role: 'user', content: 'x' }], undefined, GEMINI, {}, { temMidia: true }), 'ok');
  assert.equal(a.corpos.length, 2);
  const b = openrouterFalso([erro429, ok]);
  await assert.rejects(() => b.svc.generateResponse([{ role: 'user', content: 'x' }], undefined, GEMINI, {}, {}));
  assert.equal(b.corpos.length, 1);
});

// ---------------------------------------------------------------- RAGService (antes/depois)

/** Banco falso: responde às consultas do midiaTurno pelas tabelas abaixo. */
function bancoFalso(opts: { semTabelaDescricoes?: boolean } = {}) {
  const medias: Record<number, any> = {
    10: { id: 10, file_path: FOTO, file_type: 'image', file_size: 3000 },
    11: { id: 11, file_path: em('nao-existe-grande.mp4'), file_type: 'video', file_size: 28 * MB },
    12: { id: 12, file_path: FOTO, file_type: 'image', file_size: 3000 },
  };
  const msgMidia: Record<number, number> = { 1: 12, 3: 10, 4: 11 }; // messages.id -> media_id
  const descricoes: Record<number, any> = { 1: { tipo: 'painel', descricao: 'Painel da secadora', texto_visivel: 'E21', codigo_erro: 'E21', numero_maquina: '3' } };
  const sqls: string[] = [];
  (pool as any).getConnection = async () => ({
    release() {},
    async query(sql: string, params: number[]) {
      sqls.push(sql);
      const ids = /conversation_id = \?/.test(sql) ? params.slice(0, -1) : params;
      if (/media_descricoes/.test(sql) && opts.semTabelaDescricoes) throw new Error("Table 'agente_zap.media_descricoes' doesn't exist");
      const linhas = ids.filter((id) => msgMidia[id] !== undefined).map((id) => {
        const md = medias[msgMidia[id]];
        return { message_db_id: id, media_id: md.id, file_path: md.file_path, file_type: md.file_type, file_size: md.file_size, ...(/media_descricoes/.test(sql) ? (descricoes[id] || { descricao: null }) : {}) };
      });
      return linhas;
    },
  });
  return { sqls };
}

function criar(fone: string, linhas: any[]) {
  const svc: any = new RAGService();
  const chamadas: Array<{ input: any; model: any; extra: any }> = [];
  let resposta = 'Recebi a foto: secadora 3 com E21.';
  svc.agentConfigModel = { findByUserId: async () => ({ business_name: 'Lav', personality: 'Maria', generation_model: 'deepseek/deepseek-v4-flash', temperature: 0.2, max_age_hours: 12 }) };
  svc.conversationModel = { findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, contact_name: 'Ana', last_message_at: new Date() }) };
  svc.messageModel = { findByConversationId: async (_c: number, limit: number) => linhas.slice(-limit), findLastClientMessage: async () => linhas[0] };
  svc.topicModel = { findByUserId: async () => [], findActiveByUserId: async () => [], findByTriggerKeywords: async () => [] };
  svc.mediaModel = { findByUserId: async () => [], findByKeywords: async () => [] };
  svc.chromaService = { query: async () => [] };
  svc.ollamaService = {
    generateEmbedding: async () => [0.1],
    generateResponse: async (input: any, _c: any, model: any, _o: any, extra: any) => { chamadas.push({ input, model, extra }); return resposta; },
  };
  return { svc, chamadas, setResposta: (r: string) => { resposta = r; } };
}

const HIST = [
  { id: 1, message_id: 'w1', direction: 'incoming', content: '[media]', message_type: 'media', media_id: 12, created_at: new Date(Date.now() - 120_000) },
  { id: 2, message_id: 'w2', direction: 'outgoing', content: 'Qual máquina?', created_at: new Date(Date.now() - 100_000) },
  { id: 3, message_id: 'w3', direction: 'incoming', content: '[media]', message_type: 'media', media_id: 10, created_at: new Date() },
];

test('RAGService, AGENTE_MULTIMODAL=off: igual ao antigo (modelo do painel, só texto, sem data_collection)', async () => {
  process.env.AGENTE_MULTIMODAL = 'off';
  process.env.OPENROUTER_GENERATION_MODEL = GEMINI;
  bancoFalso();
  const { svc, chamadas } = criar(FONE_TESTE, HIST);
  await svc.generateResponse(1, 7, '[media]', undefined, true, { batchDbIds: [3], batchMessageIds: ['w3'] });
  const c = chamadas[0];
  assert.equal(c.model, 'deepseek/deepseek-v4-flash');
  assert.equal(typeof c.input[c.input.length - 1].content, 'string');
  assert.equal(c.extra.dataCollection, undefined);
  assert.ok(c.input.some((m: any) => m.content === '[media]'), 'histórico antigo: "[media]"');
});

test('RAGService, test + número de teste: foto do lote vai ao Gemini com deny e histórico vira 1 linha', async () => {
  process.env.AGENTE_MULTIMODAL = 'test';
  process.env.OPENROUTER_GENERATION_MODEL = GEMINI;
  bancoFalso();
  const { svc, chamadas } = criar(FONE_TESTE, HIST);
  await svc.generateResponse(1, 7, '[media]', undefined, true, { batchDbIds: [3], batchMessageIds: ['w3'] });
  const c = chamadas[0];
  assert.equal(c.model, GEMINI, 'o .env manda no caminho multimodal');
  assert.equal(c.extra.dataCollection, 'deny');
  assert.equal(c.extra.temMidia, true);
  const ultima = c.input[c.input.length - 1].content;
  assert.ok(Array.isArray(ultima));
  assert.match(ultima[0].text, /\[contexto do turno\][\s\S]*\[media\]\n\n\[o cliente enviou 1 foto/);
  assert.equal(ultima[1].type, 'image_url');
  assert.match(ultima[1].image_url.url, /^data:image\/jpeg;base64,/);
  const hist = c.input.slice(1, -1).map((m: any) => m.content);
  assert.deepEqual(hist, ['[foto do cliente: Painel da secadora | código de erro: E21 | máquina: 3]', 'Qual máquina?']);
});

test('RAGService, test + cliente comum: nada muda para o cliente', async () => {
  process.env.AGENTE_MULTIMODAL = 'test';
  bancoFalso();
  const { svc, chamadas } = criar(FONE_CLIENTE, HIST);
  await svc.generateResponse(1, 8, '[media]', undefined, true, { batchDbIds: [3], batchMessageIds: ['w3'] });
  assert.equal(chamadas[0].model, 'deepseek/deepseek-v4-flash');
  assert.equal(typeof chamadas[0].input[chamadas[0].input.length - 1].content, 'string');
  assert.equal(chamadas[0].extra.dataCollection, undefined);
});

test('RAGService, vídeo grande: não lê o arquivo, avisa no texto e chama o atendente', async () => {
  process.env.AGENTE_MULTIMODAL = 'on';
  bancoFalso();
  const linhas = [...HIST, { id: 4, message_id: 'w4', direction: 'incoming', content: 'olha', message_type: 'media', media_id: 11, created_at: new Date() }];
  const { svc, chamadas } = criar(FONE_CLIENTE, linhas);
  const r = await svc.generateResponse(1, 8, 'olha', undefined, true, { batchDbIds: [4], batchMessageIds: ['w4'] });
  assert.ok(!/nao-existe/.test(JSON.stringify(chamadas[0].input)));
  const ultima = chamadas[0].input[chamadas[0].input.length - 1].content;
  assert.equal(typeof ultima, 'string');
  assert.match(ultima, /\[vídeo recebido\] \(28\.0 MB/);
  assert.equal(chamadas[0].extra.temMidia, false);
  assert.match(r, /\[ALERTAR_ATENDENTE: Cliente enviou vídeo grande demais/);
});

test('RAGService, sem a tabela media_descricoes ou modelo só-texto: segue sem quebrar', async () => {
  process.env.AGENTE_MULTIMODAL = 'on';
  process.env.OPENROUTER_GENERATION_MODEL = GEMINI;
  bancoFalso({ semTabelaDescricoes: true });
  const a = criar(FONE_CLIENTE, HIST);
  await a.svc.generateResponse(1, 8, '[media]', undefined, true, { batchDbIds: [3], batchMessageIds: ['w3'] });
  assert.equal(a.chamadas[0].input[1].content, '[foto recebida]');
  // volta pelo modelo: deepseek não vê mídia, nem recebe data_collection
  process.env.OPENROUTER_GENERATION_MODEL = 'deepseek/deepseek-v4-flash';
  bancoFalso();
  const b = criar(FONE_CLIENTE, HIST);
  await b.svc.generateResponse(1, 8, '[media]', undefined, true, { batchDbIds: [3], batchMessageIds: ['w3'] });
  assert.equal(b.chamadas[0].model, 'deepseek/deepseek-v4-flash');
  assert.equal(typeof b.chamadas[0].input[b.chamadas[0].input.length - 1].content, 'string');
  assert.equal(b.chamadas[0].extra.dataCollection, undefined);
  assert.equal(b.chamadas[0].input[1].content, '[media]', 'sem deny, a descrição da mídia não vai no histórico');
  process.env.AGENTE_MULTIMODAL = 'off';
});

test('carregarMidiasDoLote: ordem do lote (chegada), não a do id; só da conversa e recebidas', async () => {
  const { sqls } = bancoFalso();
  const a = await carregarMidiasDoLote(8, [4, 3]);
  assert.deepEqual(a.map((x) => x.messageDbId), [4, 3]);
  assert.match(sqls[sqls.length - 1], /m\.conversation_id = \? AND md\.source = 'incoming'/);
  assert.deepEqual(await carregarMidiasDoLote(0, [3]), []);
});

test('RAGService: se a chamada com vídeo grande falhar, o fallback ainda chama o atendente', async () => {
  process.env.AGENTE_MULTIMODAL = 'on';
  process.env.OPENROUTER_GENERATION_MODEL = GEMINI;
  bancoFalso();
  const linhas = [...HIST, { id: 4, message_id: 'w4', direction: 'incoming', content: 'olha', message_type: 'media', media_id: 11, created_at: new Date() }];
  const { svc } = criar(FONE_CLIENTE, linhas);
  let n = 0;
  svc.ollamaService.generateResponse = async () => { if (n++ === 0) throw new Error('Erro ao gerar resposta: 413'); return 'Um atendente vai ver.'; };
  const r = await svc.processMessageAndRespond(1, 8, 'olha', true, true, { batchDbIds: [4], batchMessageIds: ['w4'] });
  assert.equal(n, 2);
  assert.match(r, /^Um atendente vai ver\.\n\[ALERTAR_ATENDENTE: Cliente enviou vídeo grande demais/);
  process.env.AGENTE_MULTIMODAL = 'off';
});

test('descrição: 429 passageiro é repetido com espera (3 tentativas); erro 400 não repete', async () => {
  const m: any = await import('../src/services/midiaTurno');
  assert.equal(typeof m.comRetentativa, 'function', 'comRetentativa ausente (código antigo: 1 retentativa de 2 s)');
  assert.deepEqual(m.ESPERAS_DESCRICAO_MS, [3000, 10000]);
  const dormidas: number[] = [];
  const dormir = async (ms: number) => { dormidas.push(ms); };
  let n = 0;
  const r = await m.comRetentativa(async () => { n++; if (n < 3) throw { response: { status: 429 } }; return 'ok'; }, [3000, 10000], dormir);
  assert.equal(r, 'ok'); assert.equal(n, 3); assert.deepEqual(dormidas, [3000, 10000]);
  n = 0; dormidas.length = 0;
  await assert.rejects(m.comRetentativa(async () => { n++; throw { response: { status: 429 } }; }, [3000, 10000], dormir));
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(m.comRetentativa(async () => { n++; throw { response: { status: 400 } }; }, [3000, 10000], dormir));
  assert.equal(n, 1);
});

test('semBase64: base64 no meio do texto (eco do provedor no erro) também some do log', async () => {
  const { semBase64 } = await import('../src/utils/semBase64');
  const b64 = Buffer.alloc(3000, 7).toString('base64');
  const r = JSON.stringify(semBase64({ error: { message: `Invalid image: data:image/jpeg;base64,${b64} rejected`, raw: `x ${b64} y` } }));
  assert.ok(!r.includes(b64.slice(0, 100)), 'base64 vazou: ' + r.slice(0, 200));
  assert.match(r, /base64,<\d+ bytes> rejected/);
  assert.match(r, /x <base64 \d+ chars> y/);
  assert.equal(semBase64({ u: 'data:image/png;base64,AAAA' }).u, 'data:image/png;base64,<3 bytes>');
  assert.equal(semBase64({ t: 'texto normal E21 secadora 03' }).t, 'texto normal E21 secadora 03');
});
