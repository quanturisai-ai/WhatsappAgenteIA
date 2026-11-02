// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/echo-registry.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { OutgoingEchoRegistry } from '../src/services/outgoingEchoRegistry';

const eco = (to: string, body: string, extra: any = {}) => ({ id: { _serialized: extra.id || '' }, to, body, hasMedia: !!extra.hasMedia, _data: extra.caption !== undefined ? { caption: extra.caption } : null });

test('não casa por hash em outro chat (sem fallback global)', () => {
  const r = new OutgoingEchoRegistry();
  r.register('111@lid', 'oi', false, { conversationId: 8, source: 'ai', isFromAI: true });
  assert.equal(r.take(eco('222@c.us', 'oi')), null);
  assert.equal(r.size(), 1);
});

test('token casa exatamente o registro certo mesmo com chave igual', () => {
  const r = new OutgoingEchoRegistry();
  const a = r.register('111@lid', 'oi', false, { conversationId: 8, source: 'ai', isFromAI: true });
  const b = r.register('111@lid', 'oi', false, { conversationId: 624, source: 'automation', isFromAI: false });
  assert.equal(r.take(eco('111@lid', 'oi'), b)?.conversationId, 624);
  assert.equal(r.take(eco('111@lid', 'oi'), a)?.conversationId, 8);
});

test('token de outro chat é ignorado (contexto vazado não casa mensagem alheia)', () => {
  const r = new OutgoingEchoRegistry();
  const a = r.register('111@lid', 'oi', false, { conversationId: 8, source: 'ai', isFromAI: true });
  assert.equal(r.take(eco('333@c.us', 'outra'), a), null);
  assert.equal(r.size(), 1);
});

test('sem token e ambíguo entre conversas: não chuta a conversa', () => {
  const r = new OutgoingEchoRegistry();
  r.register('111@lid', 'oi', false, { conversationId: 8, source: 'ai', isFromAI: true });
  r.register('111@lid', 'oi', false, { conversationId: 624, source: 'ai', isFromAI: true });
  const i = r.take(eco('111@lid', 'oi'));
  assert.equal(i?.conversationId, null, 'conversa resolvida pelo contato');
  assert.equal(i?.source, 'ai', 'origem comum preservada');
  r.register('111@lid', 'x', false, { conversationId: 8, source: 'ai', isFromAI: true });
  r.register('111@lid', 'x', false, { conversationId: 624, source: 'human', isFromAI: false });
  assert.equal(r.take(eco('111@lid', 'x')), null);
});

test('envio em andamento não expira; depois de settle conta o TTL', () => {
  let agora = 0;
  const r = new OutgoingEchoRegistry(1000, () => agora, 60_000);
  const t = r.register('111@lid', 'oi', false, { conversationId: 8, source: 'ai', isFromAI: true });
  agora = 5000; // upload lento: 5 s > TTL
  assert.equal(r.size(), 1);
  r.settle(t, 'id-1');
  agora = 5500;
  assert.equal(r.take(eco('999@c.us', 'qualquer', { id: 'id-1' }))?.conversationId, 8, 'casa pelo id');
  const t2 = r.register('111@lid', 'b', false, { conversationId: 8, source: 'ai', isFromAI: true });
  r.settle(t2, null);
  agora = 7000;
  assert.equal(r.take(eco('111@lid', 'b')), null, 'expirou depois do TTL');
  r.register('111@lid', 'c', false, { conversationId: 8, source: 'ai', isFromAI: true });
  agora = 70_000;
  assert.equal(r.take(eco('111@lid', 'c')), null, 'teto de segurança para envio que nunca terminou');
  assert.equal(r.size(), 0);
});

test('mídia: casa pela legenda; mídia sem legenda tem chave própria', () => {
  const r = new OutgoingEchoRegistry();
  r.register('111@lid', '', true, { conversationId: 8, source: 'ai', isFromAI: true, mediaId: 77 });
  assert.equal(r.take(eco('111@lid', 'oi', { hasMedia: false })), null);
  assert.equal(r.take(eco('111@lid', '', { hasMedia: true, caption: '' }))?.mediaId, 77);
});
