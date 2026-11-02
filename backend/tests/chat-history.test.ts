// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/chat-history.test.ts
// Item 3 (02/11/2026): funções puras do histórico em mensagens user/assistant.
process.env.TURN_METRICS = 'off';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatMessages,
  customHistoryToChat,
  historyRowsBeforeBatch,
  mergeConsecutive,
  rowsToChat,
} from '../src/services/chatHistory';

const r = (id: number, direction: 'incoming' | 'outgoing', content: string, message_id = `w${id}`) => ({ id, direction, content, message_id });

test('mensagens seguidas do mesmo lado são juntadas; vazias somem', () => {
  const out = mergeConsecutive([
    { role: 'user', content: 'Oi' },
    { role: 'user', content: 'tudo bem?' },
    { role: 'assistant', content: '' },
    { role: 'assistant', content: 'Olá!' },
    { role: 'assistant', content: 'Como posso ajudar?' },
    { role: 'user', content: 'Preço' },
  ]);
  assert.deepEqual(out, [
    { role: 'user', content: 'Oi\ntudo bem?' },
    { role: 'assistant', content: 'Olá!\nComo posso ajudar?' },
    { role: 'user', content: 'Preço' },
  ]);
});

test('com IDs do lote: histórico cortado na 1ª mensagem do lote (nem o lote nem a fila repetem)', () => {
  const rows = [
    r(1, 'incoming', 'Quero a promoção de final de ano'),
    r(2, 'outgoing', 'A promoção é 20% na lavagem.'),
    r(3, 'incoming', 'Quero'),        // lote atual
    r(4, 'incoming', 'pode ser hoje'), // lote atual
    r(5, 'incoming', 'ah, e secagem?'), // chegou depois, ainda na fila
  ];
  const kept = historyRowsBeforeBatch(rows, 'Quero\npode ser hoje', { batchDbIds: [3, 4], batchMessageIds: ['w3', 'w4'] });
  assert.deepEqual(kept.map((k) => k.id), [1, 2]);
  const msgs = buildChatMessages('SYS', rowsToChat(kept), 'Quero\npode ser hoje');
  assert.deepEqual(msgs.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(msgs[3].content, 'Quero\npode ser hoje');
});

test('só com message_id (sem id do banco) também corta', () => {
  const rows = [r(1, 'incoming', 'a'), r(2, 'outgoing', 'b'), r(3, 'incoming', 'c')];
  assert.deepEqual(historyRowsBeforeBatch(rows, 'c', { batchMessageIds: ['w3'] }).map((k) => k.id), [1, 2]);
});

test('sem IDs: retira as últimas mensagens do cliente que já estão no texto atual', () => {
  const rows = [r(1, 'incoming', 'Oi'), r(2, 'outgoing', 'Olá!'), r(3, 'incoming', 'Quanto custa'), r(4, 'incoming', 'a secagem?')];
  assert.deepEqual(historyRowsBeforeBatch(rows, 'Quanto custa\na secagem?').map((k) => k.id), [1, 2]);
  // mensagem atual simulada (não gravada): nada a retirar
  assert.deepEqual(historyRowsBeforeBatch(rows.slice(0, 2), 'Quanto custa?').map((k) => k.id), [1, 2]);
});

test('limite de mensagens mantém as mais recentes', () => {
  const rows = Array.from({ length: 40 }, (_, i) => r(i + 1, i % 2 ? 'outgoing' : 'incoming', `m${i + 1}`));
  const kept = historyRowsBeforeBatch(rows, 'nova', { batchDbIds: [999] }, 30);
  assert.equal(kept.length, 30);
  assert.equal(kept[0].id, 11);
  assert.equal(kept[29].id, 40);
});

test('mensagem do cliente sem resposta (IA pausada) é juntada à atual, mantendo a alternância', () => {
  const msgs = buildChatMessages(null, [{ role: 'assistant', content: 'Olá' }, { role: 'user', content: 'ficou sem resposta' }], 'e agora?');
  assert.deepEqual(msgs, [
    { role: 'assistant', content: 'Olá' },
    { role: 'user', content: 'ficou sem resposta\ne agora?' },
  ]);
});

test('mídia sem texto vira [tipo]', () => {
  assert.deepEqual(rowsToChat([{ id: 1, direction: 'incoming', content: '', message_type: 'image' }]), [{ role: 'user', content: '[image]' }]);
});

test('chat de teste do painel: Cliente/Agente -> user/assistant, sem repetir a atual', () => {
  const out = customHistoryToChat([
    { role: 'Cliente', content: 'Oi' }, { role: 'Agente', content: 'Olá!' }, { role: 'Cliente', content: 'Preço?' },
  ], 'Preço?');
  assert.deepEqual(out, [{ role: 'user', content: 'Oi' }, { role: 'assistant', content: 'Olá!' }]);
});

// ---------- Correções do juiz (02/11/2026) ----------

test('juiz #5: sem IDs, mensagem anterior que é só parte do texto atual NÃO some do histórico', () => {
  const rows = [r(1, 'outgoing', 'Olá!'), r(2, 'incoming', 'sim'), r(3, 'outgoing', 'Confirmado.'), r(4, 'incoming', 'sim, quero mais um')];
  // texto atual = só a última; "sim" (linha 2) é substring mas não é o fim exato do texto
  assert.deepEqual(historyRowsBeforeBatch(rows, 'sim, quero mais um').map((k) => k.id), [1, 2, 3]);
  // bloco incoming no fim que não bate exatamente com o texto atual: fica
  assert.deepEqual(historyRowsBeforeBatch([r(1, 'incoming', 'sim')], 'sim, claro').map((k) => k.id), [1]);
});

test('juiz #5: sem IDs, mídia obrigatória enviada depois do lote não impede retirar o lote', () => {
  const rows = [r(1, 'incoming', 'Oi'), r(2, 'outgoing', 'Olá!'), r(3, 'incoming', 'Quanto custa'), r(4, 'incoming', 'a secagem?'), { id: 5, direction: 'outgoing', content: '', message_type: 'image' }];
  const kept = historyRowsBeforeBatch(rows, 'Quanto custa\na secagem?');
  assert.deepEqual(kept.map((k) => k.id), [1, 2]);
  // texto da empresa no fim: o bloco já foi respondido, não é o lote atual
  const respondido = [r(1, 'incoming', 'Quanto custa'), r(2, 'outgoing', 'R$ 18')];
  assert.deepEqual(historyRowsBeforeBatch(respondido, 'Quanto custa').map((k) => k.id), [1, 2]);
});

test('com IDs: tudo a partir do lote sai (cronologia: o lote vai por último)', () => {
  const rows = [r(1, 'incoming', 'a'), r(2, 'outgoing', 'b'), r(3, 'incoming', 'lote'), { id: 4, direction: 'outgoing', content: '', message_type: 'image' }, r(5, 'incoming', 'na fila')];
  assert.deepEqual(historyRowsBeforeBatch(rows, 'lote', { batchDbIds: [3] }).map((k) => k.id), [1, 2]);
});
