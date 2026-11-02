// Roda com: TURN_METRICS=off node --test-force-exit -r ts-node/register/transpile-only --test tests/modelo-painel.test.ts
// Etapa 6 (02/11/2026), regra do dono: toda escolha de modelo fica no painel (agent_config); o .env só é
// padrão quando o painel está vazio; nada fixo no código. O que cada modelo aceita vem do catálogo do
// OpenRouter (aqui: itens reais copiados do GET /models de 02/11, sem rede).
//
// Os testes de "painel=X => payload model=X" no WhatsApp, descrição por outro modelo, raciocínio do GLM,
// recaída sem tools e transcrição pelo painel reprovam no código da etapa 5 (1dcd39f).
// Sem rede e sem banco: OpenRouterService de verdade com axios falso; pool e axios.post/get falsos.
process.env.TURN_METRICS = 'off';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';
process.env.HISTORY_MESSAGES = 'on';
process.env.RAG_ENABLED = 'false';
process.env.OPENROUTER_PAYLOAD = 'v2';
process.env.OPENROUTER_PROVIDER_MODE = 'default';
process.env.OPENROUTER_API_KEY = 'teste';
process.env.AUDIO_TRANSCRIPTION_ENABLED = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import pool from '../src/config/database';
import { RAGService } from '../src/services/rag.service';
import { OpenRouterService } from '../src/services/openrouter.service';
import { VmLavClienteModel } from '../src/models/vmLavCliente.model';
import { AudioTranscriptionService } from '../src/services/audioTranscription.service';
import {
  aceita, capacidadesDe, definirCatalogo, erroSemSuporteTools, limparCatalogo, limparModelosSemTools,
  marcarModeloSemTools, modeloSemTools, reasoningPara,
} from '../src/services/modelosOpenRouter';
import { escolherDescritor, resolverModelos } from '../src/services/modelosPainel';
import { deveDescreverMidia } from '../src/utils/agentFlags';

(VmLavClienteModel.prototype as any).findByTelefoneNormalized = async () => null;

const FONE_TESTE = '5561900000001';
const FONE_CLIENTE = '5562988887777';
const GEMINI = 'google/gemini-2.5-flash-lite';
const DEEPSEEK = 'deepseek/deepseek-v4.1-flash';
const GLM = 'z-ai/glm-5.3-flash';
const WHISPER = 'openai/whisper-large-v3-turbo';

// Itens reais do catálogo (02/11/2026), resumidos.
const CATALOGO = [
  { id: GLM, name: 'GLM 5.3 Flash', architecture: { input_modalities: ['text', 'image', 'video'], output_modalities: ['text'] },
    reasoning: { mandatory: true, supported_efforts: ['max', 'high', 'low'] }, supported_parameters: ['tools', 'response_format', 'reasoning'],
    pricing: { prompt: '0.0000000285', completion: '0.0000000923' } },
  { id: DEEPSEEK, name: 'DeepSeek V4.1 Flash', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
    reasoning: { mandatory: false, supported_efforts: ['max', 'high', 'low', 'none'] }, supported_parameters: ['tools', 'response_format', 'reasoning'],
    pricing: { prompt: '0.000000045', completion: '0.0000005' } },
  { id: GEMINI, architecture: { input_modalities: ['text', 'image', 'file', 'audio', 'video'], output_modalities: ['text'] },
    reasoning: { mandatory: false }, supported_parameters: ['tools', 'response_format', 'reasoning'], pricing: { prompt: '0.0000001', completion: '0.0000004' } },
  { id: WHISPER, architecture: { input_modalities: ['audio'], output_modalities: ['transcription'] }, supported_parameters: [], pricing: { prompt: '0.00000333' } },
  { id: 'vendor/so-texto', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['temperature'] },
  { id: 'vendor/audio-pensa', architecture: { input_modalities: ['text', 'audio'], output_modalities: ['text'] },
    reasoning: { mandatory: true, supported_efforts: ['high', 'low'] }, supported_parameters: ['reasoning'] },
  { id: 'vendor/recusa-tools', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, supported_parameters: ['tools'] },
];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelo-painel-'));
process.env.MIDIA_DIR_INCOMING = dir;
const FOTO = path.join(dir, 'painel.jpg');
fs.writeFileSync(FOTO, Buffer.alloc(3000, 7));
const VIDEO = path.join(dir, 'video.mp4');
fs.writeFileSync(VIDEO, Buffer.alloc(9000, 7));

const FLAGS = ['AGENTE_MODELO_PAINEL', 'AGENTE_MULTIMODAL', 'AGENTE_TOOLS', 'MIDIA_DESCRICAO_MODELO', 'AGENTE_MULTIMODAL_MODELOS',
  'OPENROUTER_GENERATION_MODEL', 'OPENROUTER_TRANSCRIPTION_MODEL', 'AGENTE_VISAO_TIMEOUT_MS', 'MIDIA_DESCRICAO', 'OPENROUTER_DATA_COLLECTION'];
function flags(v: Record<string, string>) {
  for (const k of FLAGS) delete process.env[k];
  Object.assign(process.env, v);
  limparModelosSemTools();
  definirCatalogo(CATALOGO);
}
// Nunca vai à rede: a carga do catálogo falha (o teste define o catálogo à mão).
(axios as any).get = async () => { throw new Error('sem rede no teste'); };

// ---------------------------------------------------------------- banco e descritor falsos

const DESC_E21 = { tipo: 'painel', descricao: 'Painel da secadora com erro', texto_visivel: 'E21', codigo_erro: 'E21', numero_maquina: '3' };

/** messages.id -> media; painel (agent_config) com generation/vision/transcription. */
function bancoFalso(opts: { gravadas?: Record<number, any>; painel?: { generation_model?: string | null; vision_model?: string | null; transcription_model?: string | null }; semColunas?: boolean } = {}) {
  const medias: Record<number, any> = {
    10: { id: 10, file_path: FOTO, file_type: 'image', file_size: 3000 },
    11: { id: 11, file_path: VIDEO, file_type: 'video', file_size: 9000 },
  };
  const msgMidia: Record<number, number> = { 3: 10, 4: 11 };
  const gravadas: Record<number, any> = { ...(opts.gravadas || {}) };
  const inserts: any[] = [];
  (pool as any).getConnection = async () => ({
    release() {},
    async query(sql: string, params: any[]) {
      if (/SELECT vision_model, transcription_model FROM agent_config/.test(sql)) {
        if (opts.semColunas) throw new Error("Unknown column 'vision_model'");
        return [{ vision_model: opts.painel?.vision_model ?? null, transcription_model: opts.painel?.transcription_model ?? null }];
      }
      if (/SELECT generation_model FROM agent_config/.test(sql)) return [{ generation_model: opts.painel?.generation_model ?? null }];
      if (/^\s*INSERT INTO media_descricoes/.test(sql)) {
        inserts.push(params);
        gravadas[params[0]] = { tipo: params[2], descricao: params[3], texto_visivel: params[4], codigo_erro: params[5], numero_maquina: params[6] };
        return { affectedRows: 1 };
      }
      if (/FROM medias WHERE id = \?/.test(sql)) {
        const md = medias[params[0]];
        return md ? [md] : [];
      }
      const ids = /conversation_id = \?/.test(sql) ? params.slice(0, -1) : params;
      return ids.filter((id: number) => msgMidia[id] !== undefined).map((id: number) => {
        const md = medias[msgMidia[id]];
        return {
          message_db_id: id, media_id: md.id, file_path: md.file_path, file_type: md.file_type, file_size: md.file_size,
          ...(/media_descricoes/.test(sql) ? (gravadas[id] || { descricao: null }) : {}),
        };
      });
    },
  });
  return { inserts, gravadas };
}

/** axios.post direto (descrição da mídia e transcrição usam axios.post). */
function postFalso(opts: { atraso?: number; falha?: boolean; resposta?: (url: string, body: any) => any } = {}) {
  const chamadas: Array<{ url: string; body: any }> = [];
  (axios as any).post = async (url: string, body: any) => {
    chamadas.push({ url, body });
    if (opts.atraso) await new Promise((r) => setTimeout(r, opts.atraso));
    if (opts.falha) { const e: any = new Error('400'); e.response = { status: 400 }; throw e; }
    if (opts.resposta) return opts.resposta(url, body);
    return { data: { model: body.model, usage: { cost: 0.00002 }, choices: [{ message: { content: JSON.stringify(DESC_E21) } }] } };
  };
  return chamadas;
}

// ---------------------------------------------------------------- RAGService com OpenRouter de verdade

const ok = (content: string | null, tool_calls?: any[]) => () => ({ data: { model: 'x', choices: [{ message: { content, ...(tool_calls ? { tool_calls } : {}) } }] } });
const erroTools = () => {
  const e: any = new Error('Request failed with status code 404');
  e.response = { status: 404, data: { error: { message: 'No endpoints found that support tool use. Try disabling "enviar_midia".', code: 404 } } };
  throw e;
};

const MIDIAS = [{ id: 2, title: 'Foto', description: 'Fachada da loja', file_type: 'image', is_active: true, status: 'completed', source: 'outgoing' }];

function criar(painelModel: string | null, fone: string, linhas: any[], respostas: Array<() => any> = [ok('Resposta.')]) {
  const svc: any = new RAGService();
  svc.agentConfigModel = { findByUserId: async () => ({ business_name: 'Lav', personality: 'Maria', generation_model: painelModel, temperature: 0.3, top_p: 0.5, max_age_hours: 12 }) };
  svc.conversationModel = { findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, contact_name: 'Ana', last_message_at: new Date() }) };
  svc.messageModel = { findByConversationId: async (_c: number, limit: number) => linhas.slice(-limit), findLastClientMessage: async () => linhas[0] };
  svc.topicModel = { findByUserId: async () => [], findActiveByUserId: async () => [], findByTriggerKeywords: async () => [] };
  svc.mediaModel = { findByUserId: async () => MIDIAS, findByKeywords: async () => [] };
  svc.chromaService = { query: async () => [] };
  const or: any = new OpenRouterService();
  const corpos: any[] = [];
  let i = 0;
  or.axiosInstance = { post: async (_u: string, body: any) => { corpos.push(JSON.parse(JSON.stringify(body))); return respostas[Math.min(i++, respostas.length - 1)](); } };
  svc.ollamaService = or;
  return { svc, corpos };
}

const FOTO_LOTE = [{ id: 3, message_id: 'w3', direction: 'incoming', content: 'deu erro', message_type: 'media', media_id: 10, created_at: new Date() }];
const VIDEO_LOTE = [{ id: 4, message_id: 'w4', direction: 'incoming', content: 'olha', message_type: 'media', media_id: 11, created_at: new Date() }];
const LOTE_FOTO = () => ({ batchDbIds: [3], batchMessageIds: ['w3'] });
const LOTE_VIDEO = () => ({ batchDbIds: [4], batchMessageIds: ['w4'] });
const temMidiaInline = (body: any) => /image_url|video_url|base64/.test(JSON.stringify(body.messages));
const ultimaUser = (body: any) => body.messages[body.messages.length - 1].content;

// ================================================================ item 1: painel=X => payload model=X

test('painel=X => payload model=X: WhatsApp (texto e mídia) e chat de teste, com o .env apontando outro modelo', async () => {
  for (const painel of [DEEPSEEK, GLM, 'qwen/fora-do-catalogo']) {
    flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI, AGENTE_MULTIMODAL_MODELOS: 'google/gemini-' });
    bancoFalso({ painel: { vision_model: GEMINI } });
    postFalso();
    const w = criar(painel, FONE_CLIENTE, []);
    await w.svc.generateResponse(1, 8, 'Oi, qual o horário?', undefined, true, {});
    assert.equal(w.corpos[0].model, painel, `WhatsApp texto com painel=${painel}`);
    const f = criar(painel, FONE_CLIENTE, FOTO_LOTE);
    await f.svc.generateResponse(1, 8, 'deu erro', undefined, true, LOTE_FOTO());
    assert.equal(f.corpos[0].model, painel, `WhatsApp com foto e painel=${painel}`);
    const t = criar(painel, FONE_CLIENTE, []);
    await t.svc.generateResponse(1, 0, 'Oi, qual o horário?', undefined, true, {});
    assert.equal(t.corpos[0].model, painel, `chat de teste com painel=${painel}`);
  }
});

test('painel=X com ferramentas nativas: payload model=X em todas as chamadas do loop', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', AGENTE_TOOLS: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso();
  const w = criar(DEEPSEEK, FONE_CLIENTE, [], [ok(null, [{ id: 'c1', type: 'function', function: { name: 'enviar_midia', arguments: '{"id":2}' } }]), ok('Aqui está.')]);
  const b: any = {};
  const r = await w.svc.generateResponse(1, 8, 'Manda foto da loja', undefined, true, b);
  assert.equal(r, 'Aqui está.');
  assert.equal(w.corpos.length, 2);
  assert.ok(w.corpos.every((c) => c.model === DEEPSEEK));
  assert.ok(Array.isArray(w.corpos[0].tools) && w.corpos[0].tools.length > 0);
  assert.deepEqual(b.ferramentas.acoes, [{ tipo: 'enviar_midia', id: 2 }]);
});

test('painel vazio: o .env é só o padrão; os dois vazios = erro claro (sem modelo fixo no código)', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: DEEPSEEK });
  bancoFalso();
  const w = criar(null, FONE_CLIENTE, []);
  await w.svc.generateResponse(1, 8, 'Oi', undefined, true, {});
  assert.equal(w.corpos[0].model, DEEPSEEK);
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on' });
  bancoFalso();
  const z = criar(null, FONE_CLIENTE, []);
  await assert.rejects(() => z.svc.generateResponse(1, 8, 'Oi', undefined, true, {}), /Nenhum modelo de geração configurado/);
  assert.equal(z.corpos.length, 0);
});

test('AGENTE_MODELO_PAINEL=test: só o número de teste; cliente comum fica como na etapa 5', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'test', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI, AGENTE_MULTIMODAL_MODELOS: 'google/gemini-' });
  bancoFalso();
  const a = criar(DEEPSEEK, FONE_TESTE, []);
  await a.svc.generateResponse(1, 7, 'Oi', undefined, true, {});
  assert.equal(a.corpos[0].model, DEEPSEEK);
  const b = criar(DEEPSEEK, FONE_CLIENTE, []);
  await b.svc.generateResponse(1, 8, 'Oi', undefined, true, {});
  assert.equal(b.corpos[0].model, GEMINI);
  // chat de teste só no modo on: no test, como sempre foi (o painel)
  const c = criar(DEEPSEEK, FONE_CLIENTE, []);
  await c.svc.generateResponse(1, 0, 'Oi', undefined, true, {});
  assert.equal(c.corpos[0].model, DEEPSEEK);
  assert.deepEqual(c.corpos[0].reasoning, { effort: 'none', exclude: true });
});

// ================================================================ item 6: volta

test('AGENTE_MODELO_PAINEL=off (volta): payloads idênticos aos da etapa 5 (gemini do .env, foto inline, deny)', async () => {
  for (const v of ['off', undefined]) {
    flags({ AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI, AGENTE_MULTIMODAL_MODELOS: 'google/gemini-' });
    if (v) process.env.AGENTE_MODELO_PAINEL = v;
    bancoFalso({ painel: { vision_model: GLM } });
    const post = postFalso();
    const w = criar(DEEPSEEK, FONE_CLIENTE, FOTO_LOTE);
    await w.svc.generateResponse(1, 8, 'deu erro', undefined, true, LOTE_FOTO());
    const c = w.corpos[0];
    assert.equal(c.model, GEMINI);
    assert.equal(ultimaUser(c)[1].type, 'image_url');
    assert.deepEqual(c.provider, { data_collection: 'deny' });
    assert.deepEqual(c.reasoning, { effort: 'none', exclude: true });
    assert.equal(post.length, 0, 'nenhuma descrição no turno');
    // modelo só-texto no .env (etapa 4): sem mídia, sem deny
    process.env.OPENROUTER_GENERATION_MODEL = DEEPSEEK;
    const d = criar(GLM, FONE_CLIENTE, FOTO_LOTE);
    await d.svc.generateResponse(1, 8, 'deu erro', undefined, true, LOTE_FOTO());
    assert.equal(d.corpos[0].model, DEEPSEEK);
    assert.ok(!temMidiaInline(d.corpos[0]));
    assert.equal(d.corpos[0].provider, undefined);
  }
});

// ================================================================ itens 2 e 4: capacidades e fluxo de mídia

test('catálogo: capacidades, preço e raciocínio vêm do GET /models (sem lista fixa)', () => {
  flags({});
  assert.equal(aceita(capacidadesDe(DEEPSEEK), 'image'), true);
  assert.equal(aceita(capacidadesDe(DEEPSEEK), 'video'), false);
  assert.equal(aceita(capacidadesDe(GLM), 'video'), true);
  assert.equal(aceita(capacidadesDe('qwen/fora-do-catalogo'), 'image'), null);
  assert.equal(capacidadesDe('vendor/so-texto').tools, false);
  assert.deepEqual(reasoningPara(capacidadesDe(GLM)), { effort: 'low', exclude: true });
  assert.deepEqual(reasoningPara(capacidadesDe(DEEPSEEK)), { effort: 'none', exclude: true });
  // mesmo modelo, outro catálogo => outra decisão (nada fixo)
  definirCatalogo([{ id: DEEPSEEK, architecture: { input_modalities: ['text', 'image', 'video'] }, supported_parameters: ['tools'] }]);
  assert.equal(aceita(capacidadesDe(DEEPSEEK), 'video'), true);
  limparCatalogo();
  assert.equal(capacidadesDe(DEEPSEEK).conhecido, false);
});

test('GLM no painel: reasoning pelo catálogo (low, sem "none"), foto e vídeo inline com deny', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso();
  const post = postFalso();
  const w = criar(GLM, FONE_CLIENTE, VIDEO_LOTE);
  await w.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  const c = w.corpos[0];
  assert.equal(c.model, GLM);
  assert.deepEqual(c.reasoning, { effort: 'low', exclude: true });
  assert.equal(c.max_tokens, 4096, 'raciocínio obrigatório: folga no teto para a resposta não vir vazia');
  assert.equal(ultimaUser(c)[1].type, 'video_url');
  assert.deepEqual(c.provider, { data_collection: 'deny' });
  assert.equal(post.length, 0);
});

test('deepseek no painel + foto: aceita imagem, então a foto vai inline (sem descrição no turno)', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso({ painel: { vision_model: GLM } });
  const post = postFalso();
  const w = criar(DEEPSEEK, FONE_CLIENTE, FOTO_LOTE);
  await w.svc.generateResponse(1, 8, 'deu erro', undefined, true, LOTE_FOTO());
  assert.equal(w.corpos[0].model, DEEPSEEK);
  assert.equal(ultimaUser(w.corpos[0])[1].type, 'image_url');
  assert.deepEqual(w.corpos[0].provider, { data_collection: 'deny' });
  assert.equal(post.length, 0);
});

test('deepseek no painel + vídeo: o modelo de foto/vídeo do painel descreve (deny) e a descrição entra como texto', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  const banco = bancoFalso({ painel: { vision_model: GLM } });
  const post = postFalso();
  const w = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  const r = await w.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  assert.equal(post.length, 1);
  const desc = post[0].body;
  assert.equal(desc.model, GLM, 'descritor = vision_model do painel');
  assert.deepEqual(desc.provider, { data_collection: 'deny' });
  assert.equal(desc.messages[0].content[1].type, 'video_url');
  assert.deepEqual(desc.reasoning, { effort: 'low', exclude: true }, 'raciocínio do descritor pelo catálogo');
  assert.equal(banco.inserts.length, 1, 'descrição gravada para o histórico');
  const c = w.corpos[0];
  assert.equal(c.model, DEEPSEEK);
  assert.ok(!temMidiaInline(c), 'o vídeo não vai ao deepseek');
  assert.match(ultimaUser(c), /descrição feita por outro modelo[\s\S]*\[vídeo do cliente: Painel da secadora com erro \| código de erro: E21 \| máquina: 3\]/);
  assert.deepEqual(c.provider, { data_collection: 'deny' });
  assert.doesNotMatch(r, /ALERTAR_ATENDENTE/);
});

test('modelo de foto/vídeo vazio no painel: usa o padrão do .env (MIDIA_DESCRICAO_MODELO, senão OPENROUTER_GENERATION_MODEL)', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso({ semColunas: true }); // colunas novas ainda não criadas: cai no .env sem quebrar
  const post = postFalso();
  const w = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  await w.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  assert.equal(post[0].body.model, GEMINI);
  assert.equal(w.corpos[0].model, DEEPSEEK);
});

test('nenhum modelo aceita o vídeo: atendente (marcador sem tools; ação automática com tools)', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso({ painel: { vision_model: DEEPSEEK } });
  const post = postFalso();
  const w = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE, [ok('Vou verificar.')]);
  const r = await w.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  assert.equal(post.length, 0, 'ninguém aceita: não tenta descrever');
  assert.match(ultimaUser(w.corpos[0]), /nenhum modelo configurado consegue ver/);
  assert.match(r, /\[ALERTAR_ATENDENTE: Cliente enviou 1 foto\(s\)\/vídeo\(s\) que nenhum modelo configurado no painel consegue ver/);
  // com tools nativas
  process.env.AGENTE_TOOLS = 'on';
  bancoFalso({ painel: { vision_model: DEEPSEEK } });
  const t = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE, [ok('Vou verificar.')]);
  const b: any = LOTE_VIDEO();
  await t.svc.generateResponse(1, 8, 'olha', undefined, true, b);
  assert.ok(b.ferramentas.acoes.some((a: any) => a.tipo === 'chamar_atendente' && a.automatico));
});

test('descrição falhou: foto vira "não consegue ver"; vídeo chama atendente', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI, AGENTE_VISAO_TIMEOUT_MS: '1000' });
  bancoFalso({ painel: { generation_model: 'vendor/so-texto', vision_model: GEMINI } });
  postFalso({ falha: true });
  const a = criar('vendor/so-texto', FONE_CLIENTE, FOTO_LOTE);
  await a.svc.generateResponse(1, 8, 'deu erro', undefined, true, LOTE_FOTO());
  assert.match(ultimaUser(a.corpos[0]), /\[foto recebida\] \(1 foto\(s\) que você não consegue ver/);
  assert.ok(!temMidiaInline(a.corpos[0]));
  bancoFalso({ painel: { vision_model: GEMINI } });
  postFalso({ atraso: 3000 }); // passa do prazo
  const b = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  const r = await b.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  assert.match(ultimaUser(b.corpos[0]), /\[vídeo recebido\]/);
  assert.match(r, /\[ALERTAR_ATENDENTE: Cliente enviou 1 vídeo\(s\) que a IA não conseguiu abrir/);
  await new Promise((res) => setTimeout(res, 2200)); // a descrição atrasada termina antes do próximo teste
});

test('descrição da chegada (gravada ou em andamento) é reaproveitada no turno, sem pagar outra chamada', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso({ gravadas: { 4: DESC_E21 }, painel: { vision_model: GLM } });
  let post = postFalso();
  const a = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  await a.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  assert.equal(post.length, 0);
  assert.match(ultimaUser(a.corpos[0]), /código de erro: E21/);
  bancoFalso({ painel: { vision_model: GLM } });
  post = postFalso({ atraso: 150 });
  const { descreverMidiaRecebida } = await import('../src/services/midiaTurno');
  const { opcoesDescricaoChegada } = await import('../src/services/modelosPainel');
  const chegada = descreverMidiaRecebida(4, 11, opcoesDescricaoChegada(1, FONE_CLIENTE));
  const b = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  await b.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  await chegada;
  assert.equal(post.length, 1, 'uma chamada só (a da chegada)');
  assert.equal(post[0].body.model, GLM, 'a chegada também usa o modelo do painel');
  assert.match(ultimaUser(b.corpos[0]), /código de erro: E21/);
});

test('chegada: com a flag sempre descreve (painel pode ser só-texto); sem a flag, como na etapa 4', () => {
  flags({ AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: DEEPSEEK, AGENTE_MULTIMODAL_MODELOS: 'google/gemini-' });
  assert.equal(deveDescreverMidia(FONE_CLIENTE), false);
  process.env.AGENTE_MODELO_PAINEL = 'on';
  assert.equal(deveDescreverMidia(FONE_CLIENTE), true);
  process.env.MIDIA_DESCRICAO = 'off';
  assert.equal(deveDescreverMidia(FONE_CLIENTE), false);
});

test('escolherDescritor e resolverModelos (funções puras)', () => {
  flags({ OPENROUTER_GENERATION_MODEL: GEMINI, OPENROUTER_TRANSCRIPTION_MODEL: WHISPER });
  const cap = capacidadesDe;
  assert.equal(escolherDescritor('video', { geracao: DEEPSEEK, visao: GLM }, cap), GLM);
  assert.equal(escolherDescritor('image', { geracao: DEEPSEEK, visao: 'vendor/so-texto' }, cap), DEEPSEEK, 'visão não abre foto: o principal descreve');
  assert.equal(escolherDescritor('video', { geracao: DEEPSEEK, visao: DEEPSEEK }, cap), null);
  assert.equal(escolherDescritor('video', { geracao: DEEPSEEK, visao: 'x/desconhecido' }, cap), 'x/desconhecido');
  assert.deepEqual(resolverModelos({ generation_model: ' ', vision_model: null, transcription_model: GEMINI }), { geracao: GEMINI, visao: GEMINI, transcricao: GEMINI });
  process.env.MIDIA_DESCRICAO_MODELO = GLM;
  assert.equal(resolverModelos({ generation_model: DEEPSEEK }).visao, GLM);
});

// ================================================================ item 5: ferramentas

test('modelo sem tools no catálogo: o turno vai direto no modo por marcador', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', AGENTE_TOOLS: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso();
  const w = criar('vendor/so-texto', FONE_CLIENTE, [], [ok('Segue a foto. [ENVIAR_MIDIA:2]')]);
  const b: any = {};
  const r = await w.svc.generateResponse(1, 8, 'Manda foto da loja', undefined, true, b);
  assert.equal(w.corpos.length, 1);
  assert.equal(w.corpos[0].model, 'vendor/so-texto');
  assert.equal(w.corpos[0].tools, undefined);
  assert.match(w.corpos[0].messages[0].content, /\[ENVIAR_MIDIA/);
  assert.match(r, /\[ENVIAR_MIDIA:2\]/);
  assert.equal(b.ferramentas, undefined);
});

test('provedor recusa tools: refaz o turno no modo por marcador; os seguintes já vão sem tools', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', AGENTE_TOOLS: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  bancoFalso();
  const w = criar('vendor/recusa-tools', FONE_CLIENTE, [], [erroTools, ok('Segue a foto. [ENVIAR_MIDIA:2]')]);
  const b: any = {};
  const r = await w.svc.generateResponse(1, 8, 'Manda foto da loja', undefined, true, b);
  assert.equal(w.corpos.length, 2);
  assert.ok(w.corpos[0].tools);
  assert.equal(w.corpos[1].tools, undefined);
  assert.equal(w.corpos[1].model, 'vendor/recusa-tools');
  assert.match(w.corpos[1].messages[0].content, /\[ENVIAR_MIDIA/);
  assert.match(r, /\[ENVIAR_MIDIA:2\]/);
  assert.equal(b.ferramentas, undefined);
  const w2 = criar('vendor/recusa-tools', FONE_CLIENTE, [], [ok('Oi')]);
  await w2.svc.generateResponse(1, 8, 'Oi', undefined, true, {});
  assert.equal(w2.corpos.length, 1);
  assert.equal(w2.corpos[0].tools, undefined);
  // flag desligada: sem refazer (o erro sobe, fallback antigo da etapa 5)
  flags({ AGENTE_MODELO_PAINEL: 'off', AGENTE_MULTIMODAL: 'off', AGENTE_TOOLS: 'on', OPENROUTER_GENERATION_MODEL: GEMINI });
  const w3 = criar('vendor/recusa-tools', FONE_CLIENTE, [], [erroTools, ok('x')]);
  await assert.rejects(() => w3.svc.generateResponse(1, 8, 'Oi', undefined, true, {}));
});

test('erroSemSuporteTools e marca de 1 h', () => {
  assert.equal(erroSemSuporteTools({ response: { status: 404, data: { error: { message: 'No endpoints found that support tool use.' } } } }), true);
  assert.equal(erroSemSuporteTools({ response: { status: 404, data: { error: { message: 'Model not found' } } } }), false);
  assert.equal(erroSemSuporteTools({ response: { status: 429, data: 'tool use' } }), false);
  limparModelosSemTools();
  marcarModeloSemTools('A/B', 1000);
  assert.equal(modeloSemTools('a/b', 1000 + 59 * 60_000), true);
  assert.equal(modeloSemTools('a/b', 1000 + 61 * 60_000), false);
});

// ================================================================ item 3: transcrição pelo painel

const AUDIO = Buffer.alloc(2000, 1);
const respTranscricao = (url: string) => (/audio\/transcriptions/.test(url)
  ? { data: { text: 'olá via stt', usage: { seconds: 2 } } }
  : { data: { choices: [{ message: { content: 'olá via chat' } }], usage: {} } });

test('transcrição: modelo do painel, rota pelo catálogo e deny; .env é padrão; flag off como antes', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', OPENROUTER_TRANSCRIPTION_MODEL: GEMINI });
  bancoFalso({ painel: { transcription_model: WHISPER } });
  let post = postFalso({ resposta: respTranscricao });
  let r = await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(r?.text, 'olá via stt');
  assert.match(post[0].url, /audio\/transcriptions$/);
  assert.equal(post[0].body.model, WHISPER);
  assert.deepEqual(post[0].body.provider, { data_collection: 'deny' });
  // painel vazio: .env (gemini, aceita áudio => chat)
  bancoFalso();
  post = postFalso({ resposta: respTranscricao });
  r = await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(r?.text, 'olá via chat');
  assert.match(post[0].url, /chat\/completions$/);
  assert.equal(post[0].body.model, GEMINI);
  assert.deepEqual(post[0].body.provider, { data_collection: 'deny' });
  // painel com modelo que não aceita áudio: não chama, avisa
  bancoFalso({ painel: { transcription_model: DEEPSEEK } });
  post = postFalso({ resposta: respTranscricao });
  r = await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(r, null);
  assert.equal(post.length, 0);
  // flag off: o .env, sem provider (igual à etapa 5)
  flags({ AGENTE_MODELO_PAINEL: 'off', OPENROUTER_TRANSCRIPTION_MODEL: GEMINI });
  bancoFalso({ painel: { transcription_model: WHISPER } });
  post = postFalso({ resposta: respTranscricao });
  r = await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(r?.text, 'olá via chat');
  assert.equal(post[0].body.model, GEMINI);
  assert.equal(post[0].body.provider, undefined);
});

// ================================================================ regra do dono: nenhum modelo fixo

// ================================================================ correções do juiz (02/11)

test('modo test: raciocínio do catálogo só no número de teste; cliente comum com o payload de antes', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'test', AGENTE_MULTIMODAL: 'off', OPENROUTER_GENERATION_MODEL: GLM });
  bancoFalso();
  const a = criar(GLM, FONE_TESTE, []);
  await a.svc.generateResponse(1, 7, 'Oi', undefined, true, {});
  assert.deepEqual(a.corpos[0].reasoning, { effort: 'low', exclude: true });
  assert.equal(a.corpos[0].max_tokens, 4096);
  const b = criar(GLM, FONE_CLIENTE, []);
  await b.svc.generateResponse(1, 8, 'Oi', undefined, true, {});
  assert.deepEqual(b.corpos[0].reasoning, { effort: 'none', exclude: true }, 'cliente fora da lista: igual à etapa 5');
  assert.equal(b.corpos[0].max_tokens, 1024);
  // deepseek (raciocínio opcional) no painel: teto de sempre
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'off', OPENROUTER_GENERATION_MODEL: GEMINI });
  const d = criar(DEEPSEEK, FONE_CLIENTE, []);
  await d.svc.generateResponse(1, 8, 'Oi', undefined, true, {});
  assert.equal(d.corpos[0].max_tokens, 1024);
});

test('prazo da descrição: estourou esperando a da chegada => "não vista" na hora, sem segunda chamada', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', AGENTE_MULTIMODAL: 'on', OPENROUTER_GENERATION_MODEL: GEMINI, AGENTE_VISAO_TIMEOUT_MS: '1000' });
  bancoFalso({ painel: { vision_model: GLM } });
  const post = postFalso({ atraso: 3000 });
  const { descreverMidiaRecebida } = await import('../src/services/midiaTurno');
  const { opcoesDescricaoChegada } = await import('../src/services/modelosPainel');
  const chegada = descreverMidiaRecebida(4, 11, opcoesDescricaoChegada(1, FONE_CLIENTE));
  const w = criar(DEEPSEEK, FONE_CLIENTE, VIDEO_LOTE);
  const t0 = Date.now();
  const r = await w.svc.generateResponse(1, 8, 'olha', undefined, true, LOTE_VIDEO());
  const ms = Date.now() - t0;
  assert.ok(ms < 1900, `uma espera só (${ms} ms)`);
  assert.match(r, /\[ALERTAR_ATENDENTE: Cliente enviou 1 vídeo\(s\) que a IA não conseguiu abrir.*veja o vídeo/);
  await chegada; // a da chegada termina sozinha e grava para o histórico
  assert.equal(post.length, 1, 'nenhuma chamada além da chegada');
});

test('alerta de foto sem modelo fala da foto', async () => {
  const { alertaVideoGrande } = await import('../src/services/midiaTurno');
  const plano: any = { videosGrandes: [], videosNaoVistos: [], semModelo: [{ mediaId: 1, tipo: 'foto' }] };
  assert.match(alertaVideoGrande(plano) || '', /veja a foto na conversa/);
});

test('transcrição por modelo de chat com raciocínio obrigatório: manda o menor esforço (sem 400)', async () => {
  flags({ AGENTE_MODELO_PAINEL: 'on', OPENROUTER_TRANSCRIPTION_MODEL: GEMINI });
  bancoFalso({ painel: { transcription_model: 'vendor/audio-pensa' } });
  const post = postFalso({ resposta: respTranscricao });
  const r = await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(r?.text, 'olá via chat');
  assert.deepEqual(post[0].body.reasoning, { effort: 'low', exclude: true });
  assert.deepEqual(post[0].body.provider, { data_collection: 'deny' });
  // gemini (raciocínio opcional): payload sem reasoning, como antes
  bancoFalso();
  const p2 = postFalso({ resposta: respTranscricao });
  await new AudioTranscriptionService().transcribe(AUDIO, 'audio/ogg', { userId: 1, contato: FONE_CLIENTE });
  assert.equal(p2[0].body.reasoning, undefined);
});

test('nenhum id de modelo fixo no código de produção (exceto o ollama.service, código morto)', () => {
  const raiz = path.join(__dirname, '..', 'src');
  const achados: string[] = [];
  const re = /['"`](?:google|deepseek|z-ai|openai|anthropic|qwen|meta-llama|mistralai|x-ai)\/[A-Za-z0-9._:-]+|['"`]deepseek-r1['"`]/;
  const andar = (d: string) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { andar(p); continue; }
      if (!/\.ts$/.test(n) || /ollama\.service\.ts$|migrateModelColumns\.ts$/.test(p)) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*)/.test(l)) return;
        if (re.test(l)) achados.push(`${path.relative(raiz, p)}:${i + 1}`);
      });
    }
  };
  andar(raiz);
  assert.deepEqual(achados, []);
});
