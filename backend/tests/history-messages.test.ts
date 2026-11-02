// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/history-messages.test.ts
// Item 3 (02/11/2026), prova antes/depois pelo RAGService real (modelos e LLM falsos):
// - antes: histórico narrativo de 10 msgs, lote do debounce repetido no histórico e na
//   "Última pergunta", 2 buscas RAG (2 embeddings) por turno, resumo nunca usado;
// - depois (HISTORY_MESSAGES=on): mensagens user/assistant, 30 msgs / 72 h, lote uma vez só,
//   uma busca RAG.
// Usa só a interface antiga (processMessageAndRespond), então roda também no código antigo.
process.env.TURN_METRICS = 'off';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import { RAGService } from '../src/services/rag.service';
import { VmLavClienteModel } from '../src/models/vmLavCliente.model';

// Sem banco: o cliente de fidelidade não é encontrado.
(VmLavClienteModel.prototype as any).findByTelefoneNormalized = async () => null;

const FONE_TESTE = '5561900000001';
const FONE_CLIENTE = '5562988887777';

interface Linha { id: number; message_id: string; direction: 'incoming' | 'outgoing'; content: string; created_at: Date }

/** Conversa com `trocas` pares cliente/IA e depois o lote atual (3 mensagens do cliente). */
function conversa(trocas: number, lote: string[]): Linha[] {
  const linhas: Linha[] = [];
  let id = 1;
  const t0 = Date.now() - 3600_000;
  linhas.push({ id, message_id: `w${id}`, direction: 'incoming', content: 'Meu nome é Ana e quero o plano Ouro', created_at: new Date(t0) }); id++;
  linhas.push({ id, message_id: `w${id}`, direction: 'outgoing', content: 'Anotado, Ana! O plano Ouro custa R$ 259,90.', created_at: new Date(t0 + 1000) }); id++;
  for (let i = 0; i < trocas; i++) {
    linhas.push({ id, message_id: `w${id}`, direction: 'incoming', content: `pergunta ${i}`, created_at: new Date(t0 + id * 1000) }); id++;
    linhas.push({ id, message_id: `w${id}`, direction: 'outgoing', content: `resposta ${i}`, created_at: new Date(t0 + id * 1000) }); id++;
  }
  for (const c of lote) { linhas.push({ id, message_id: `w${id}`, direction: 'incoming', content: c, created_at: new Date(t0 + id * 1000) }); id++; }
  return linhas;
}

function criar(linhas: Linha[], fone = FONE_TESTE, lastMessageAt = new Date()) {
  const svc: any = new RAGService();
  const entradas: any[] = [];
  const buscas: string[] = [];
  let resumos = 0;
  let pedidasAoBanco: { limit: number; maxAgeHours?: number }[] = [];
  svc.agentConfigModel = { findByUserId: async () => ({ business_name: 'Lavanderia Teste', personality: 'Seja gentil.', max_age_hours: 12 }) };
  svc.conversationModel = {
    findById: async (id: number) => ({ id, user_id: 1, contact_number: fone, contact_name: 'Ana', last_message_at: lastMessageAt }),
  };
  svc.messageModel = {
    findByConversationId: async (_c: number, limit: number, maxAgeHours?: number) => {
      pedidasAoBanco.push({ limit, maxAgeHours });
      return linhas.slice(-limit);
    },
    findLastClientMessage: async () => linhas.filter((l) => l.direction === 'incoming').slice(-2)[0] || null,
  };
  svc.retrieveContext = async (_u: number, q: string) => { buscas.push(q); return 'Tabela: lavagem R$ 18,00.'; };
  svc.generateConversationSummary = async () => { resumos++; return 'RESUMO'; };
  svc.ollamaService = { generateResponse: async (input: any) => { entradas.push(input); return 'Claro, Ana!'; } };
  return { svc, entradas, buscas, resumos: () => resumos, pedidasAoBanco: () => pedidasAoBanco };
}

/** Todo o texto enviado ao LLM (string antiga ou lista de mensagens nova). */
function texto(input: any): string {
  return Array.isArray(input) ? input.map((m: any) => m.content).join('\n') : String(input);
}
const ocorrencias = (s: string, sub: string) => s.split(sub).length - 1;

const LOTE = ['Quero agendar', 'para amanhã cedo', 'tem vaga às 8h?'];
const IDS = (linhas: Linha[]) => ({
  batchDbIds: linhas.slice(-3).map((l) => l.id),
  batchMessageIds: linhas.slice(-3).map((l) => l.message_id),
});

test('lote atual do debounce aparece uma vez só no que vai ao LLM', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(2, LOTE);
  const { svc, entradas } = criar(linhas);
  await svc.processMessageAndRespond(1, 7, LOTE.join('\n'), true, true, IDS(linhas));
  const t = texto(entradas[0]);
  for (const m of LOTE) assert.equal(ocorrencias(t, m), 1, `"${m}" repetido no prompt`);
});

test('uma busca RAG por turno (sem a 2ª busca com a mensagem anterior)', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(2, LOTE);
  const { svc, buscas } = criar(linhas);
  await svc.processMessageAndRespond(1, 7, LOTE.join('\n'), true, true, IDS(linhas));
  assert.equal(buscas.length, 1);
});

test('contexto longo: o nome e o plano do 1º turno continuam visíveis depois de 12 trocas', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(12, ['qual plano eu pedi?']);
  const { svc, entradas } = criar(linhas);
  await svc.processMessageAndRespond(1, 7, 'qual plano eu pedi?', true, true, { batchDbIds: [linhas[linhas.length - 1].id] });
  const t = texto(entradas[0]);
  assert.ok(t.includes('plano Ouro'), 'a mensagem do 1º turno sumiu do histórico');
  assert.ok(t.includes('R$ 259,90'), 'a resposta da IA do 1º turno sumiu do histórico');
});

test('formato: system + user/assistant alternados, terminando no lote atual', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(2, LOTE);
  const { svc, entradas, pedidasAoBanco } = criar(linhas);
  await svc.processMessageAndRespond(1, 7, LOTE.join('\n'), true, true, IDS(linhas));
  const msgs = entradas[0];
  assert.ok(Array.isArray(msgs), 'deveria ir como lista de mensagens');
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[0].content.includes('Seja gentil.'));
  assert.ok(!msgs[0].content.includes('Histórico da conversa:'), 'sem histórico narrativo no system');
  for (let i = 2; i < msgs.length; i++) assert.notEqual(msgs[i].role, msgs[i - 1].role, 'papéis têm que alternar');
  assert.deepEqual(msgs[msgs.length - 1], { role: 'user', content: LOTE.join('\n') });
  assert.equal(msgs[1].role, 'user');
  assert.equal(pedidasAoBanco()[0].maxAgeHours, 72, 'janela padrão 72 h');
  assert.equal(pedidasAoBanco()[0].limit, 50, '30 msgs + folga para o lote');
});

test('resumo morto não é chamado (nem com last_message_at antigo)', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(1, ['oi?']);
  const h = criar(linhas, FONE_TESTE, new Date(Date.now() - 48 * 3600_000));
  await h.svc.processMessageAndRespond(1, 7, 'oi?', true, true, { batchDbIds: [linhas[linhas.length - 1].id] });
  assert.equal(h.resumos(), 0);
});

test('HISTORY_MAX_MESSAGES / HISTORY_MAX_AGE_HOURS configuráveis', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  process.env.HISTORY_MAX_MESSAGES = '4';
  process.env.HISTORY_MAX_AGE_HOURS = '24';
  try {
    const linhas = conversa(10, ['e aí?']);
    const { svc, entradas, pedidasAoBanco } = criar(linhas);
    await svc.processMessageAndRespond(1, 7, 'e aí?', true, true, { batchDbIds: [linhas[linhas.length - 1].id] });
    const msgs = entradas[0];
    assert.equal(msgs.length, 1 + 4 + 1);
    assert.equal(pedidasAoBanco()[0].maxAgeHours, 24);
  } finally {
    delete process.env.HISTORY_MAX_MESSAGES;
    delete process.env.HISTORY_MAX_AGE_HOURS;
  }
});

test('#contatoia (sem histórico): só system + mensagem atual', async () => {
  process.env.HISTORY_MESSAGES = 'on';
  const linhas = conversa(3, ['#contatoia avisa o 61999990000']);
  const { svc, entradas } = criar(linhas);
  await svc.processMessageAndRespond(1, 7, '#contatoia avisa o 61999990000', true, false, {});
  assert.equal(entradas[0].length, 2);
  assert.deepEqual(entradas[0].map((m: any) => m.role), ['system', 'user']);
});

test('HISTORY_MESSAGES=test não afeta cliente comum; off = prompt antigo (texto único, 2 buscas)', async () => {
  for (const [modo, fone] of [['test', FONE_CLIENTE], ['off', FONE_TESTE]] as const) {
    process.env.HISTORY_MESSAGES = modo;
    const linhas = conversa(2, LOTE);
    const { svc, entradas, buscas } = criar(linhas, fone);
    svc.needsRecontextualization = async () => false;
    await svc.processMessageAndRespond(1, 7, LOTE.join('\n'), true, true, IDS(linhas));
    assert.equal(typeof entradas[0], 'string', `${modo}: deveria manter o texto único antigo`);
    assert.ok(entradas[0].includes('Histórico da conversa:'));
    assert.ok(entradas[0].includes('Última pergunta do cliente:'));
    assert.equal(buscas.length, 2, `${modo}: comportamento antigo faz 2 buscas`);
  }
});
