// Roda com: node --test-force-exit -r ts-node/register/transpile-only tests/turn-race.test.ts
// Item 2 (02/11/2026), prova antes/depois: cliente escreve enquanto a IA gera a resposta.
// Antes: o debounce disparava um 2º turno em paralelo (2 respostas). Depois: 1 turno por vez,
// o 1º é cancelado e refeito com as duas mensagens. Usa só a interface antiga (handleIncomingMessage).
process.env.TURN_METRICS = 'off';
process.env.WHATSAPP_PROVIDER = 'synczap';
process.env.SYNCZ_BASE_URL = 'http://synczap.invalid';
process.env.SYNCZ_API_KEY = 'chave-de-teste';
process.env.SYNCZ_INSTANCE_ID = 'instancia-teste';
process.env.AGENTE_TEST_NUMBERS = '5561900000001';

import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppService } from '../src/services/whatsapp.service';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Integração com WhatsAppService.handleIncomingMessage ----------

const FONE = '5561900000001';

function criarWhatsApp() {
  const svc: any = new WhatsAppService(1);
  const mensagens: any[] = [];
  svc.conversationModel = {
    findByUserOrLid: async () => ({ id: 7, user_id: 1, contact_number: FONE, status: 'in_progress', lid: null }),
    update: async () => true,
    getConversationCardById: async () => null,
  };
  svc.messageModel = { create: async (m: any) => { const n = { id: mensagens.length + 100, ...m }; mensagens.push(n); return n; } };
  svc.getContactInfo = async () => ({ contactNumber: FONE, contactName: 'Dono', lid: null });
  svc.emit = () => true;
  let ativos = 0, max = 0;
  const turnos: { content: string; meta: any }[] = [];
  svc.conversationService = {
    processIncomingMessage: async (_u: number, _c: number, content: string, _w: any, meta: any = {}) => {
      ativos++; max = Math.max(max, ativos);
      try {
        await new Promise<void>((r) => { const t = setTimeout(r, 150); meta.control?.signal.addEventListener('abort', () => { clearTimeout(t); r(); }); });
        if (meta.control && !meta.control.isCurrent()) return 'superseded';
        turnos.push({ content, meta });
        return 'sent';
      } finally { ativos--; }
    },
  };
  let n = 0;
  const receber = (body: string) => svc.handleIncomingMessage({
    isStatus: false, from: `${FONE}@c.us`, body, type: 'chat', hasMedia: false,
    id: { _serialized: `wa-${++n}` }, timestamp: Math.floor(Date.now() / 1000),
  });
  return { svc, turnos, max: () => max, receber };
}

test('integração: cliente escreve durante a geração -> 1 resposta com as 2 mensagens (antes: 2 respostas em paralelo)', async () => {
  process.env.TURN_SCHEDULER = 'test';
  process.env.MESSAGE_DEBOUNCE_MS = '50';
  process.env.DEBOUNCE_BASE_MS = '50';
  process.env.DEBOUNCE_GREETING_MS = '80';
  process.env.DEBOUNCE_MAX_MS = '200';
  const w = criarWhatsApp();
  await w.receber('Vocês abrem domingo?');
  await esperar(120); // 1º turno gerando
  await w.receber('e no feriado?');
  await esperar(600);
  assert.equal(w.max(), 1, 'dois turnos simultâneos na mesma conversa');
  assert.equal(w.turnos.length, 1, 'tinha que sair uma resposta só');
  assert.equal(w.turnos[0].content, 'Vocês abrem domingo?\ne no feriado?');
  assert.deepEqual(w.turnos[0].meta.batchMessageIds, ['wa-1', 'wa-2'], 'fila guarda os IDs do WhatsApp');
  assert.deepEqual(w.turnos[0].meta.batchDbIds, [100, 101], 'fila guarda os IDs do banco');
});

test('integração: TURN_SCHEDULER=off mantém o debounce antigo (janela fixa MESSAGE_DEBOUNCE_MS)', async () => {
  process.env.TURN_SCHEDULER = 'off';
  process.env.MESSAGE_DEBOUNCE_MS = '60';
  const w = criarWhatsApp();
  await w.receber('Oi');
  await w.receber('quanto custa?');
  await esperar(400);
  assert.equal(w.turnos.length, 1);
  assert.equal(w.turnos[0].content, 'Oi\nquanto custa?');
  assert.equal(w.turnos[0].meta.control, undefined, 'caminho antigo, sem agendador');
});

test('integração: modo test não afeta cliente comum', async () => {
  process.env.TURN_SCHEDULER = 'test';
  process.env.MESSAGE_DEBOUNCE_MS = '60';
  const w = criarWhatsApp();
  w.svc.getContactInfo = async () => ({ contactNumber: '5562988887777', contactName: 'Cliente', lid: null });
  await w.receber('quanto custa?');
  await esperar(300);
  assert.equal(w.turnos.length, 1);
  assert.equal(w.turnos[0].meta.control, undefined);
});

