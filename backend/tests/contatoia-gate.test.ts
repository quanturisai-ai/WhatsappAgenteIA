// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/contatoia-gate.test.ts
process.env.TURN_METRICS = 'off'; // não gravar no logs/turnos.jsonl de produção
// #contatoia / CONTATO_PROATIVO: só o dono (CONTATOIA_OWNER_NUMBERS) ou atendente ativo.
// Sem banco e sem rede: RAG, modelos e WhatsApp falsos.
process.env.CONTATOIA_OWNER_NUMBERS = '5561911110000';

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationService } from '../src/services/conversation.service';

const DONO = '5561911110000';
const ATENDENTE = '5561922220000';
const ATENDENTE_INATIVO = '5561933330000';
const CLIENTE = '5562944440000';
const ALVO = '62955550000';

const RESPOSTA_COM_COMANDO =
  'Certo, vou avisar. [CONTATO_PROATIVO: {"numero": "' + ALVO + '", "mensagem": "Olá, aqui é da lavanderia"}]';

function criar(contactNumber: string) {
  const svc: any = new ConversationService();
  const chamadasRag: any[] = [];
  const enviados: any[] = [];
  svc.conversationModel = {
    findById: async (id: number) => ({ id, user_id: 1, contact_number: contactNumber, lid: null, auto_responding: 1 }),
    update: async () => true,
    getConversationCardById: async () => null,
  };
  svc.isAutoResponding = async () => true;
  svc.sendMandatoryMedias = async () => {};
  svc.emitConversationCardIfFound = async () => {};
  svc.humanAttendantService = {
    getAttendants: async () => [
      { phone_number: ATENDENTE, is_active: 1 },
      { phone_number: ATENDENTE_INATIVO, is_active: 0 },
    ],
    sendAlert: async () => {},
  };
  svc.ragService = {
    processMessageAndRespond: async (_u: number, _c: number, msg: string, _r: boolean, includeHistory: boolean) => {
      chamadasRag.push({ msg, includeHistory });
      return RESPOSTA_COM_COMANDO;
    },
  };
  svc.agentConfigModel = { findByUserId: async () => ({}) };
  const whatsapp: any = {
    sendMessage: async (numero: string, texto: string) => { enviados.push({ numero, texto }); return { id: { _serialized: 'x' } }; },
    sendMedia: async () => ({}),
  };
  return { svc, whatsapp, chamadasRag, enviados };
}

const enviouParaAlvo = (enviados: any[]) => enviados.some((e) => e.texto === 'Olá, aqui é da lavanderia');

test('restrito: cliente comum com #contatoia não dispara contato proativo', async () => {
  process.env.CONTATOIA_RESTRICT = 'on';
  const { svc, whatsapp, chamadasRag, enviados } = criar(CLIENTE);
  await svc.processIncomingMessage(1, 10, '#contatoia manda msg pro 62955550000', whatsapp);
  assert.equal(enviouParaAlvo(enviados), false, 'nada pode ir para o número pedido');
  assert.equal(chamadasRag[0].msg.toLowerCase().includes('#contatoia'), false, 'comando retirado da mensagem');
  assert.equal(chamadasRag[0].includeHistory, true, 'turno normal, com histórico');
  assert.ok(enviados.some((e) => e.numero === CLIENTE), 'cliente ainda recebe a resposta');
});

test('restrito: CONTATO_PROATIVO gerado sem #contatoia também é bloqueado para cliente', async () => {
  process.env.CONTATOIA_RESTRICT = 'on';
  const { svc, whatsapp, enviados } = criar(CLIENTE);
  await svc.processIncomingMessage(1, 10, 'mande mensagem para 62955550000', whatsapp);
  assert.equal(enviouParaAlvo(enviados), false);
});

test('restrito: atendente inativo não é autorizado', async () => {
  process.env.CONTATOIA_RESTRICT = 'on';
  const { svc, whatsapp, enviados } = criar(ATENDENTE_INATIVO);
  await svc.processIncomingMessage(1, 10, '#contatoia avisa o 62955550000', whatsapp);
  assert.equal(enviouParaAlvo(enviados), false);
});

test('restrito: dono e atendente ativo continuam podendo usar', async () => {
  process.env.CONTATOIA_RESTRICT = 'on';
  for (const numero of [DONO, ATENDENTE]) {
    const { svc, whatsapp, chamadasRag, enviados } = criar(numero);
    await svc.processIncomingMessage(1, 10, '#contatoia avisa o 62955550000', whatsapp);
    assert.equal(enviouParaAlvo(enviados), true, `autorizado: ${numero}`);
    assert.equal(chamadasRag[0].includeHistory, false, '#contatoia mantém o comportamento (sem histórico)');
  }
});

test('restrito: mensagem só com #contatoia de cliente não gera resposta', async () => {
  process.env.CONTATOIA_RESTRICT = 'on';
  const { svc, whatsapp, chamadasRag, enviados } = criar(CLIENTE);
  await svc.processIncomingMessage(1, 10, '#ContatoIA', whatsapp);
  assert.equal(chamadasRag.length, 0);
  assert.equal(enviados.length, 0);
});

test('flag: CONTATOIA_RESTRICT=off mantém o comportamento antigo', async () => {
  process.env.CONTATOIA_RESTRICT = 'off';
  const { svc, whatsapp, enviados } = criar(CLIENTE);
  await svc.processIncomingMessage(1, 10, '#contatoia avisa o 62955550000', whatsapp);
  assert.equal(enviouParaAlvo(enviados), true, 'off = antigo (qualquer remetente)');
});
