/**
 * TEMPORÁRIO — Validação AO VIVO (isolada) da Fase 4: novas transições de estado.
 *
 * Sem sessão WhatsApp ativa neste ambiente, não é possível exercitar handleIncomingMessage/
 * handleOutgoingMessage (dependem de um `msg` real do whatsapp-web.js). Este script valida
 * o que É seguro e real de testar sem uma sessão: as transições de conversation.service.ts
 * (takeOverConversation, finishConversation) e a persistência de handler/origin/
 * last_client_message_at/pause_on_human_reply via os models reais — usando uma conversa
 * descartável apagada ao final. Nenhum dado de cliente real é tocado.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-validate-fase4-live.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../src/config/database';
import { ConversationModel } from '../src/models/conversation.model';
import { AgentConfigModel } from '../src/models/agentConfig.model';
import { ConversationService } from '../src/services/conversation.service';

const TEST_CONTACT = '0000000TESTF4'; // <= 20 chars

function ok(cond: boolean, label: string, allOk: { v: boolean }) {
  allOk.v = allOk.v && cond;
  console.log(`   ${cond ? '✅' : '❌'} ${label}`);
}

async function main() {
  const conversationModel = new ConversationModel();
  const conversationService = new ConversationService();
  const agentConfigModel = new AgentConfigModel();
  const allOk = { v: true };

  const cleanupConn = await pool.getConnection();
  try {
    await cleanupConn.query('DELETE FROM conversations WHERE contact_number = ?', [TEST_CONTACT]);
  } finally {
    cleanupConn.release();
  }

  console.log('0) Lendo agent_config real do usuário 1 (pause_on_human_reply)...');
  const cfg = await agentConfigModel.findByUserId(1);
  console.log(`   pause_on_human_reply = ${cfg?.pause_on_human_reply} (esperado: default TRUE/1 pós-migration)`);
  ok(
    cfg?.pause_on_human_reply === true || cfg?.pause_on_human_reply === 1 || cfg === null,
    'pause_on_human_reply lido do banco (ou config inexistente, também válido)',
    allOk
  );

  console.log('1) Criando conversa de teste descartável...');
  const conv = await conversationModel.create({
    user_id: 1,
    contact_number: TEST_CONTACT,
    contact_name: '[TESTE TEMPORÁRIO FASE 4 - APAGAR]',
    status: 'new',
    last_message_at: new Date(),
  });
  console.log(`   conversa criada: id=${conv.id}`);

  try {
    console.log('2) takeOverConversation() — assumir manualmente...');
    await conversationService.takeOverConversation(conv.id);
    const afterTakeover = await conversationModel.findById(conv.id);
    ok(afterTakeover?.status === 'in_progress', `status='in_progress' (obtido: ${afterTakeover?.status})`, allOk);
    ok((afterTakeover as any)?.handler === 'human', `handler='human' (obtido: ${(afterTakeover as any)?.handler})`, allOk);
    ok(
      afterTakeover?.auto_responding === false || afterTakeover?.auto_responding === 0,
      `auto_responding=false (obtido: ${afterTakeover?.auto_responding})`,
      allOk
    );

    console.log('3) Simulando pendência ativa (needs_intervention=1) antes de encerrar...');
    await conversationModel.update(conv.id, { needs_intervention: true });

    console.log('4) finishConversation() — encerrar atendimento...');
    await conversationService.finishConversation(conv.id);
    const afterFinish = await conversationModel.findById(conv.id);
    ok(afterFinish?.status === 'finished', `status='finished' (obtido: ${afterFinish?.status})`, allOk);
    ok((afterFinish as any)?.handler === 'none', `handler='none' (obtido: ${(afterFinish as any)?.handler})`, allOk);
    ok(
      afterFinish?.needs_intervention === false || afterFinish?.needs_intervention === 0,
      `needs_intervention=false (obtido: ${afterFinish?.needs_intervention})`,
      allOk
    );
    ok(
      afterFinish?.auto_responding === true || afterFinish?.auto_responding === 1,
      `auto_responding=true (obtido: ${afterFinish?.auto_responding})`,
      allOk
    );

    console.log('5) Testando persistência direta de origin e last_client_message_at via update()...');
    const testDate = new Date();
    await conversationModel.update(conv.id, {
      origin: 'campaign',
      last_client_message_at: testDate,
    });
    const afterFieldsUpdate = await conversationModel.findById(conv.id);
    ok((afterFieldsUpdate as any)?.origin === 'campaign', `origin='campaign' (obtido: ${(afterFieldsUpdate as any)?.origin})`, allOk);
    const gotDate = (afterFieldsUpdate as any)?.last_client_message_at
      ? new Date((afterFieldsUpdate as any).last_client_message_at)
      : null;
    ok(
      gotDate !== null && Math.abs(gotDate.getTime() - testDate.getTime()) < 2000,
      `last_client_message_at persistido corretamente (obtido: ${gotDate?.toISOString()})`,
      allOk
    );

    console.log('6) Confirmando que o job de auto-finalização enxerga a coluna materializada...');
    const activeForJob = await conversationModel.findActiveConversationsWithLastClientMessage();
    const notInList = !activeForJob.some((c) => c.id === conv.id);
    ok(notInList, `conversa finalizada não aparece na lista de conversas ativas do job (correto)`, allOk);

    console.log(allOk.v ? '\n✅ FASE 4 CONFIRMADA (transições testáveis sem WhatsApp ao vivo).' : '\n❌ FALHOU — investigar.');
  } finally {
    console.log('7) Limpando dados de teste...');
    const conn = await pool.getConnection();
    try {
      await conn.query('DELETE FROM conversations WHERE id = ? AND contact_number = ?', [conv.id, TEST_CONTACT]);
      console.log('   conversa de teste removida.');
    } finally {
      conn.release();
    }
  }

  await pool.end();
  if (!allOk.v) process.exit(1);
}

main().catch(async (e) => {
  console.error('Erro no teste:', e);
  process.exit(1);
});
