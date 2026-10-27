/**
 * TEMPORÁRIO — Validação AO VIVO (mas isolada) da correção P2 (finishConversation).
 *
 * Cria UMA conversa descartável (contact_number claramente marcado como teste),
 * simula o estado "zumbi" (finished + needs_intervention=1, o bug atual descrito
 * no diagnóstico), chama o método REAL corrigido, confirma o resultado e
 * DELETA a conversa de teste ao final — nenhum dado real de cliente é tocado.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-validate-fase1-live.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../src/config/database';
import { ConversationModel } from '../src/models/conversation.model';
import { ConversationService } from '../src/services/conversation.service';

const TEST_CONTACT = '0000000TESTF1'; // <= 20 chars (limite da coluna contact_number)

async function main() {
  const conversationModel = new ConversationModel();
  const conversationService = new ConversationService();

  // Idempotência: remover eventual resíduo de uma execução anterior interrompida
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
    contact_name: '[TESTE TEMPORÁRIO - APAGAR]',
    status: 'in_progress',
    last_message_at: new Date(),
  });
  console.log(`   conversa criada: id=${conv.id}`);

  try {
    console.log('2) Simulando estado "zumbi" do bug atual (needs_intervention=1)...');
    await conversationModel.update(conv.id, { needs_intervention: true });
    const before = await conversationModel.findById(conv.id);
    console.log(`   antes: status=${before?.status} needs_intervention=${before?.needs_intervention}`);

    console.log('3) Chamando o método REAL corrigido: conversationService.finishConversation()...');
    await conversationService.finishConversation(conv.id);

    const after = await conversationModel.findById(conv.id);
    console.log(`   depois: status=${after?.status} needs_intervention=${after?.needs_intervention} auto_responding=${after?.auto_responding}`);

    const ok =
      after?.status === 'finished' &&
      (after?.needs_intervention === false || after?.needs_intervention === 0) &&
      (after?.auto_responding === true || after?.auto_responding === 1);

    console.log(ok ? '\n✅ P2 CONFIRMADO: finishConversation agora limpa needs_intervention.' : '\n❌ FALHOU — investigar.');
  } finally {
    console.log('4) Limpando conversa de teste...');
    const conn = await pool.getConnection();
    try {
      await conn.query('DELETE FROM conversations WHERE id = ? AND contact_number = ?', [conv.id, TEST_CONTACT]);
      console.log('   conversa de teste removida.');
    } finally {
      conn.release();
    }
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('Erro no teste:', e);
  process.exit(1);
});
