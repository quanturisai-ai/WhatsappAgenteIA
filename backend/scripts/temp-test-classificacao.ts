/**
 * TEMPORÁRIO — Testes sintéticos da nova lógica de classificação.
 *
 * Valida a máquina de estados de temp-classificacao-lib.ts contra todos os
 * cenários levantados no diagnóstico, ANTES de tocar no sistema real.
 * Não acessa banco, não acessa WhatsApp — 100% em memória.
 *
 * Uso: npx ts-node --transpile-only scripts/temp-test-classificacao.ts
 * Apagar após a implementação definitiva.
 */
import {
  applyEvent,
  initialState,
  toKanbanColumn,
  toLegacyKanbanColumn,
  shouldAutoFinalize,
  shouldAutoFinalizeLegacy,
  deriveSource,
  replayHistory,
  normalizeContent,
  ConversationState,
  HistoricMessage,
} from './temp-classificacao-lib';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}`);
    console.log(`       esperado: ${JSON.stringify(expected)}`);
    console.log(`       obtido:   ${JSON.stringify(actual)}`);
  }
}

function h(hoursAgo: number): Date {
  return new Date(Date.now() - hoursAgo * 3600 * 1000);
}

function section(title: string) {
  console.log('\n' + '─'.repeat(70));
  console.log(title);
  console.log('─'.repeat(70));
}

// ===========================================================================
section('CENÁRIO 1 — Fluxo orgânico: cliente inicia, IA responde');
// ===========================================================================
{
  let s = initialState({ type: 'client_message', at: h(1) });
  check('1.1 cliente novo → status new / origem inbound', [s.status, s.origin], ['new', 'inbound']);
  check('1.2 coluna = aguardando_resposta (a verdadeira "Nova Interação")', toKanbanColumn(s), 'aguardando_resposta');

  // PROBLEMA ATUAL: status virava in_progress ANTES da resposta ser gerada.
  // NOVA REGRA: só muda quando ai_reply_sent (envio confirmado).
  s = applyEvent(s, { type: 'ai_reply_sent', at: h(0.9) });
  check('1.3 IA respondeu com sucesso → in_progress / handler ai', [s.status, s.handler], ['in_progress', 'ai']);
  check('1.4 coluna = ia_atendendo', toKanbanColumn(s), 'ia_atendendo');

  const secondClientAt = h(0.5);
  s = applyEvent(s, { type: 'client_message', at: secondClientAt });
  check('1.5 cliente continua conversando → permanece ia_atendendo', toKanbanColumn(s), 'ia_atendendo');
  check('1.6 lastClientMessageAt acompanha o cliente', s.lastClientMessageAt?.getTime(), secondClientAt.getTime());
}

// ===========================================================================
section('CENÁRIO 2 — Falha do RAG (hoje: falso positivo silencioso)');
// ===========================================================================
{
  let s = initialState({ type: 'client_message', at: h(1) });
  s = applyEvent(s, { type: 'ai_reply_failed', at: h(0.9) });
  check('2.1 RAG falhou → conversa NÃO vira in_progress', s.status, 'new');
  check('2.2 RAG falhou → vira pendência (needs_intervention)', s.needsIntervention, true);
  check('2.3 coluna = pendencias (hoje ficaria "Em Atendimento" sem resposta)', toKanbanColumn(s), 'pendencias');
}

// ===========================================================================
section('CENÁRIO 3 — Campanha de fidelização (hoje: polui "Nova Interação")');
// ===========================================================================
{
  // 3a. Cliente que NUNCA conversou recebe disparo
  let s = initialState({ type: 'automation_sent', at: h(2) });
  check('3.1 disparo cria conversa finalizada, não "new"', s.status, 'finished');
  check('3.2 origem = campaign', s.origin, 'campaign');
  check('3.3 coluna = finalizadas (hoje apareceria em "Nova Interação")', toKanbanColumn(s), 'finalizadas');

  // comparação com comportamento atual
  check('3.4 [ATUAL, para contraste] disparo criava status new → nova_interacao',
    toLegacyKanbanColumn('new', false), 'nova_interacao');

  // 3b. Cliente responde a campanha → reabre como aguardando resposta
  s = applyEvent(s, { type: 'client_message', at: h(1) });
  check('3.5 cliente respondeu campanha → aguardando_resposta', toKanbanColumn(s), 'aguardando_resposta');
  check('3.6 origem preservada = campaign (métrica de retorno de campanha)', s.origin, 'campaign');

  // 3c. IA assume o retorno da campanha
  s = applyEvent(s, { type: 'ai_reply_sent', at: h(0.9) });
  check('3.7 IA respondeu retorno de campanha → ia_atendendo', toKanbanColumn(s), 'ia_atendendo');
}

// ===========================================================================
section('CENÁRIO 4 — Automação NÃO mantém conversa viva (auto-finalização)');
// ===========================================================================
{
  // Cliente falou há 20h; automação disparou há 1h. maxAge = 12h.
  // Timestamps fixados em variáveis (não recalculados via h()) para o teste não ser
  // sensível a variação de Date.now() entre a construção do evento e a asserção.
  const clientAt = h(20);
  const automationAt = h(1);
  let s = initialState({ type: 'client_message', at: clientAt });
  s = applyEvent(s, { type: 'ai_reply_sent', at: h(19.9) });
  s = applyEvent(s, { type: 'automation_sent', at: automationAt });

  check('4.1 automação atualiza lastMessageAt', s.lastMessageAt?.getTime(), automationAt.getTime());
  check('4.2 automação NÃO atualiza lastClientMessageAt', s.lastClientMessageAt?.getTime(), clientAt.getTime());

  const now = new Date();
  check('4.3 [ATUAL] job NÃO finalizaria (last_message_at fresco pela automação)',
    shouldAutoFinalizeLegacy('in_progress', s.lastMessageAt, now, 12), false);
  check('4.4 [NOVO] job finaliza (cliente inativo há 20h > 12h)',
    shouldAutoFinalize(s, now, 12), true);

  // Cliente ativo recentemente não pode ser finalizado
  let s2 = initialState({ type: 'client_message', at: h(2) });
  s2 = applyEvent(s2, { type: 'ai_reply_sent', at: h(1.9) });
  check('4.5 cliente ativo há 2h → NÃO finaliza', shouldAutoFinalize(s2, now, 12), false);

  // Conversa só-campanha antiga: fallback para lastMessageAt
  const s3 = initialState({ type: 'automation_sent', at: h(30) });
  check('4.6 conversa só-campanha já nasce finished → job não mexe', shouldAutoFinalize(s3, now, 12), false);
}

// ===========================================================================
section('CENÁRIO 5 — Atendimento humano');
// ===========================================================================
{
  // 5a. Takeover via dashboard
  let s = initialState({ type: 'client_message', at: h(1) });
  s = applyEvent(s, { type: 'ai_reply_sent', at: h(0.9) });
  s = applyEvent(s, { type: 'takeover', at: h(0.8) });
  check('5.1 takeover → humano_atendendo', toKanbanColumn(s), 'humano_atendendo');
  check('5.2 takeover pausa IA', s.autoResponding, false);

  // 5b. PROBLEMA ATUAL: atendente responde pelo CELULAR e status não muda.
  let s2 = initialState({ type: 'client_message', at: h(1) });
  check('5.3 [pré-condição] conversa aguardando resposta', toKanbanColumn(s2), 'aguardando_resposta');
  s2 = applyEvent(s2, { type: 'human_reply', at: h(0.5), via: 'device' });
  check('5.4 [NOVO] resposta humana pelo celular → humano_atendendo', toKanbanColumn(s2), 'humano_atendendo');
  check('5.5 [NOVO] resposta humana pelo celular pausa a IA (evita resposta dupla)', s2.autoResponding, false);

  // 5c. Cliente responde durante atendimento humano → bola continua com humano
  s2 = applyEvent(s2, { type: 'client_message', at: h(0.4) });
  check('5.6 cliente respondeu durante atendimento humano → permanece humano_atendendo', toKanbanColumn(s2), 'humano_atendendo');
}

// ===========================================================================
section('CENÁRIO 6 — Encerramento e pendências (bug atual: pendência presa)');
// ===========================================================================
{
  let s = initialState({ type: 'client_message', at: h(3) });
  s = applyEvent(s, { type: 'ai_reply_sent', at: h(2.9) });
  s = applyEvent(s, { type: 'ai_alert_attendant', at: h(2.8) });
  check('6.1 [ALERTAR_ATENDENTE] → pendencias', toKanbanColumn(s), 'pendencias');

  s = applyEvent(s, { type: 'finish', at: h(1) });
  check('6.2 [NOVO] finish limpa needs_intervention (bug atual: ficava presa)', s.needsIntervention, false);
  check('6.3 finish → finalizadas', toKanbanColumn(s), 'finalizadas');
  check('6.4 finish reativa IA para próxima interação', s.autoResponding, true);

  // contraste com bug atual: finished + needsIntervention=true ficava em Pendências
  check('6.5 [ATUAL, para contraste] finished + pendência → presa em pendencias',
    toLegacyKanbanColumn('finished', true), 'pendencias');

  // Reabertura pós-encerramento
  s = applyEvent(s, { type: 'client_message', at: h(0.5) });
  check('6.6 reabertura → aguardando_resposta, handler resetado', [toKanbanColumn(s), s.handler], ['aguardando_resposta', 'none']);
}

// ===========================================================================
section('CENÁRIO 7 — Contato proativo da IA');
// ===========================================================================
{
  let s = initialState({ type: 'ai_proactive_sent', at: h(2) });
  check('7.1 contato proativo não entra no funil ativo', toKanbanColumn(s), 'finalizadas');
  check('7.2 origem = outbound', s.origin, 'outbound');
  s = applyEvent(s, { type: 'client_message', at: h(1) });
  check('7.3 cliente respondeu ao proativo → aguardando_resposta', toKanbanColumn(s), 'aguardando_resposta');
}

// ===========================================================================
section('CENÁRIO 8 — deriveSource (backfill de dados legados)');
// ===========================================================================
{
  const automationSet = new Set([normalizeContent('🎉 Parabéns! Você ganhou um prêmio!\n\nRetire na loja.')]);

  check('8.1 incoming → client',
    deriveSource({ direction: 'incoming', is_from_ai: false, content: 'oi' }, automationSet), 'client');
  check('8.2 outgoing is_from_ai=1 → ai',
    deriveSource({ direction: 'outgoing', is_from_ai: true, content: 'Olá! Como posso ajudar?' }, automationSet), 'ai');
  check('8.3 outgoing que bate com fidelizacao_notificacoes → automation',
    deriveSource({ direction: 'outgoing', is_from_ai: false, content: '🎉 Parabéns!  Você ganhou um prêmio!\n\nRetire na loja. ' }, automationSet), 'automation');
  check('8.4 outgoing manual → human',
    deriveSource({ direction: 'outgoing', is_from_ai: false, content: 'Bom dia, aqui é o atendente' }, automationSet), 'human');
}

// ===========================================================================
section('CENÁRIO 9 — replayHistory (reconstrução de conversas legadas)');
// ===========================================================================
{
  const now = new Date();

  // 9a. Conversa típica: cliente → IA → cliente → IA, ativa há 1h
  const hist1: HistoricMessage[] = [
    { source: 'client', at: h(2) },
    { source: 'ai', at: h(1.9) },
    { source: 'client', at: h(1.1) },
    { source: 'ai', at: h(1) },
  ];
  const r1 = replayHistory(hist1, false, now, 12);
  check('9.1 conversa ativa IA → ia_atendendo', toKanbanColumn(r1), 'ia_atendendo');

  // 9b. Conversa antiga (cliente sumiu há 30h) mas com automação recente
  const hist2: HistoricMessage[] = [
    { source: 'client', at: h(30) },
    { source: 'ai', at: h(29.9) },
    { source: 'automation', at: h(2) },
  ];
  const r2 = replayHistory(hist2, false, now, 12);
  check('9.2 cliente inativo 30h + automação recente → finalizadas (não fica presa)', toKanbanColumn(r2), 'finalizadas');

  // 9c. Conversa SÓ de campanha (cliente nunca respondeu)
  const hist3: HistoricMessage[] = [
    { source: 'automation', at: h(50) },
    { source: 'automation', at: h(3) },
  ];
  const r3 = replayHistory(hist3, false, now, 12);
  check('9.3 só-campanha → finalizadas / origem campaign', [toKanbanColumn(r3), r3.origin], ['finalizadas', 'campaign']);

  // 9d. Cliente respondeu campanha há 1h e ninguém atendeu
  const hist4: HistoricMessage[] = [
    { source: 'automation', at: h(5) },
    { source: 'client', at: h(1) },
  ];
  const r4 = replayHistory(hist4, false, now, 12);
  check('9.4 retorno de campanha sem resposta → aguardando_resposta', toKanbanColumn(r4), 'aguardando_resposta');

  // 9e. Atendimento humano pelo celular, ativo
  const hist5: HistoricMessage[] = [
    { source: 'client', at: h(2) },
    { source: 'human', at: h(1) },
  ];
  const r5 = replayHistory(hist5, false, now, 12);
  check('9.5 humano respondeu pelo celular → humano_atendendo', toKanbanColumn(r5), 'humano_atendendo');

  // 9f. Pendência do banco é preservada na reconstrução
  const r6 = replayHistory(hist1, true, now, 12);
  check('9.6 needs_intervention do banco preservado → pendencias', toKanbanColumn(r6), 'pendencias');

  // 9g. Conversa sem mensagens (borda)
  const r7 = replayHistory([], false, now, 12);
  check('9.7 conversa sem mensagens → finalizadas (não quebra)', toKanbanColumn(r7), 'finalizadas');
}

// ===========================================================================
// Resumo
// ===========================================================================
console.log('\n' + '='.repeat(70));
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
if (failed > 0) {
  console.log('Falhas:');
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('Todos os cenários da nova lógica validados em memória. ✅');
