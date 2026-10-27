/**
 * TEMPORÁRIO — Validação AO VIVO (isolada) da Fase 3: persistência de messages.source.
 *
 * Não há sessão WhatsApp ativa neste ambiente (whatsapp_sessions.status='connection_failed'),
 * então não é possível exercitar o fluxo completo sendMessage -> client.sendMessage ->
 * message_create -> handleOutgoingMessage. Este script valida o que É seguro e real de testar
 * sem uma sessão ativa: que o MessageModel real (já alterado) grava e lê `source` corretamente
 * para os 4 valores possíveis, usando uma conversa e mensagens descartáveis que são apagadas
 * ao final — nenhum dado de cliente real é tocado.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-validate-fase3-live.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../src/config/database';
import { ConversationModel } from '../src/models/conversation.model';
import { MessageModel } from '../src/models/message.model';
import { MessageSource } from '../src/types';

const TEST_CONTACT = '0000000TESTF3'; // <= 20 chars

async function main() {
  const conversationModel = new ConversationModel();
  const messageModel = new MessageModel();

  const cleanupConn = await pool.getConnection();
  try {
    await cleanupConn.query('DELETE FROM conversations WHERE contact_number = ?', [TEST_CONTACT]);
  } finally {
    cleanupConn.release();
  }

  console.log('1) Criando conversa de teste descartável...');
  const conv = await conversationModel.create({
    user_id: 1,
    contact_number: TEST_CONTACT,
    contact_name: '[TESTE TEMPORÁRIO FASE 3 - APAGAR]',
    status: 'new',
    last_message_at: new Date(),
  });
  console.log(`   conversa criada: id=${conv.id}`);

  let allOk = true;
  try {
    const sources: MessageSource[] = ['client', 'ai', 'human', 'automation'];
    const createdIds: number[] = [];

    console.log('2) Gravando uma mensagem para cada source, via MessageModel.create() real...');
    for (const source of sources) {
      const direction = source === 'client' ? 'incoming' : 'outgoing';
      const msg = await messageModel.create({
        conversation_id: conv.id,
        message_id: `test-fase3-${source}-${Date.now()}`,
        content: `Mensagem de teste (${source})`,
        message_type: 'text',
        direction: direction as 'incoming' | 'outgoing',
        is_from_ai: source === 'ai',
        source,
      });
      createdIds.push(msg.id);
      const ok = msg.source === source;
      allOk = allOk && ok;
      console.log(`   ${ok ? '✅' : '❌'} source='${source}' -> gravado como '${msg.source}' (id=${msg.id})`);
    }

    console.log('3) Relendo via findById() e findByConversationId() (métodos usados pelo app real)...');
    for (const id of createdIds) {
      const reread = await messageModel.findById(id);
      const ok = reread?.source !== undefined && reread?.source !== null;
      allOk = allOk && ok;
      console.log(`   ${ok ? '✅' : '❌'} findById(${id}) -> source='${reread?.source}'`);
    }

    const viaConversationId = await messageModel.findByConversationId(conv.id, 20);
    const allHaveSource = viaConversationId.every((m) => m.source !== undefined && m.source !== null);
    allOk = allOk && allHaveSource && viaConversationId.length === sources.length;
    console.log(
      `   ${allHaveSource ? '✅' : '❌'} findByConversationId() retornou ${viaConversationId.length}/${sources.length} mensagens, todas com source preenchido`
    );

    console.log('4) Testando MessageModel.update() para source...');
    const [firstId] = createdIds;
    await messageModel.update(firstId, { source: 'human' });
    const afterUpdate = await messageModel.findById(firstId);
    const updateOk = afterUpdate?.source === 'human';
    allOk = allOk && updateOk;
    console.log(`   ${updateOk ? '✅' : '❌'} update() sobrescreveu source para 'human'`);

    console.log(allOk ? '\n✅ FASE 3 (plumbing de dados) CONFIRMADA.' : '\n❌ FALHOU — investigar.');
  } finally {
    console.log('5) Limpando dados de teste...');
    const conn = await pool.getConnection();
    try {
      await conn.query('DELETE FROM conversations WHERE id = ? AND contact_number = ?', [conv.id, TEST_CONTACT]);
      console.log('   conversa e mensagens de teste removidas (CASCADE).');
    } finally {
      conn.release();
    }
  }

  await pool.end();
  if (!allOk) process.exit(1);
}

main().catch(async (e) => {
  console.error('Erro no teste:', e);
  process.exit(1);
});
