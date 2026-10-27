/**
 * TEMPORÁRIO — Validação da Fase 1 contra o CÓDIGO REAL (não a lib de simulação).
 * READ-ONLY: só chama métodos de leitura dos models já editados. Nenhum UPDATE.
 *
 * Objetivo: provar que o novo método ConversationModel.findActiveConversationsWithLastClientMessage()
 * (usado agora por finalizeOldConversations) funciona sobre os dados reais e que a decisão de
 * finalizar ou não cada conversa ativa hoje é a esperada.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-validate-fase1-real.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../src/config/database';
import { ConversationModel } from '../src/models/conversation.model';
import { AgentConfigModel } from '../src/models/agentConfig.model';

async function main() {
  const conversationModel = new ConversationModel();
  const agentConfigModel = new AgentConfigModel();

  const legacyActive = await conversationModel.findActiveConversations();
  const newActive = await conversationModel.findActiveConversationsWithLastClientMessage();

  console.log(`findActiveConversations() [antigo, exige last_message_at]: ${legacyActive.length} conversas`);
  console.log(`findActiveConversationsWithLastClientMessage() [novo]: ${newActive.length} conversas`);

  console.log('\nDetalhe por conversa ativa (status new/in_progress):');
  for (const c of newActive) {
    const maxAgeHours = (await agentConfigModel.findByUserId(c.user_id))?.max_age_hours ?? 12;
    const reference = (c as any).last_client_message_at || c.last_message_at;
    const ageHours = reference ? (Date.now() - new Date(reference).getTime()) / 3600000 : null;
    const wouldFinalizeOld = c.last_message_at
      ? (Date.now() - new Date(c.last_message_at).getTime()) / 3600000 > maxAgeHours
      : false;
    const wouldFinalizeNew = ageHours !== null ? ageHours > maxAgeHours : false;
    const flag = wouldFinalizeOld !== wouldFinalizeNew ? '  <<< DECISÃO MUDOU' : '';
    console.log(
      `  conv ${c.id} | status=${c.status} | maxAge=${maxAgeHours}h | ` +
      `last_message_at=${c.last_message_at ? new Date(c.last_message_at).toISOString() : 'NULL'} | ` +
      `last_client_message_at=${(c as any).last_client_message_at ? new Date((c as any).last_client_message_at).toISOString() : 'NULL'} | ` +
      `finalizaria(antigo)=${wouldFinalizeOld} finalizaria(novo)=${wouldFinalizeNew}${flag}`
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
