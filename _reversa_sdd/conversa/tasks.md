# Conversa — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Tabelas `conversations` e `messages` criadas no banco
- [ ] `RAGService` disponível (depende de Ollama + ChromaDB)
- [ ] `AgentConfigService` disponível (configurações do agente)
- [ ] `WhatsAppService` disponível (envio de mensagens)
- [ ] Socket.IO configurado

## Tarefas

- [ ] T-01 — Implementar `ConversationModel.findAll(userId)`: lista conversas do usuário com metadados
  - Origem no legado: `backend/src/models/conversation.model.ts`
  - Critério de pronto: retorna array de conversas do userId com campos completos
  - Confiança: 🟢

- [ ] T-02 — Implementar `ConversationModel.findById(id, userId)`: busca conversa com LEFT JOIN vm_lav_clientes via `normaliza_telefone()`
  - Origem no legado: `backend/src/models/conversation.model.ts:findById`
  - Critério de pronto: retorna conversa enriquecida com dados do cliente da lavanderia quando disponíveis
  - Confiança: 🟢

- [ ] T-03 — Implementar `isAutoResponding(conversationId)`: SELECT `auto_responding`, tratar null como true
  - Origem no legado: `backend/src/services/conversation.service.ts:isAutoResponding`
  - Critério de pronto: campo null retorna true; false retorna false
  - Confiança: 🟢

- [ ] T-04 — Implementar `pauseAutoResponding(conversationId)` e `resumeAutoResponding(conversationId)`: UPDATE auto_responding
  - Origem no legado: `backend/src/services/conversation.service.ts`
  - Critério de pronto: UPDATE refletido no banco imediatamente
  - Confiança: 🟢

- [ ] T-05 — Implementar `extractAlertCommand(response)`: parse de `[ALERTA_ATENDENTE:msg]` com regex, retorno do comando extraído e texto limpo
  - Origem no legado: `backend/src/services/conversation.service.ts:extractAlertCommand`
  - Critério de pronto: texto com comando retorna { command: msg, cleanText } sem o marcador
  - Confiança: 🟢

- [ ] T-06 — Implementar `extractMediaCommands(response)`: parse de `[ENVIAR_MIDIA:id]` (múltiplos possíveis)
  - Origem no legado: `backend/src/services/conversation.service.ts:extractMediaCommands`
  - Critério de pronto: extrai todos os IDs de mídia do texto; texto limpo retornado sem marcadores
  - Confiança: 🟢

- [ ] T-07 — Implementar `extractProactiveContactCommand(response)`: parse de `[CONTATO_PROATIVO:numero]`
  - Origem no legado: `backend/src/services/conversation.service.ts:extractProactiveContactCommand`
  - Critério de pronto: extrai número e texto limpo
  - Confiança: 🟢

- [ ] T-08 — Implementar `processIncomingMessage()`: pipeline completo — isAutoResponding → mídias obrigatórias → RAG → parse de comandos → envio de resposta → persistência
  - Origem no legado: `backend/src/services/conversation.service.ts:processIncomingMessage`
  - Critério de pronto: mensagem recebida gera resposta IA enviada ao WhatsApp e persistida no banco
  - Confiança: 🟢

- [ ] T-09 — Implementar tratamento de `#contatoia`: omissão do histórico no contexto enviado ao LLM quando presente
  - Origem no legado: `backend/src/services/conversation.service.ts`
  - Critério de pronto: mensagem com `#contatoia` envia contexto sem histórico ao Ollama
  - Confiança: 🟢

- [ ] T-10 — Implementar `finalizeOldConversations()`: SELECT conversas inativas > max_age_hours, UPDATE status=finished + auto_responding=true
  - Origem no legado: `backend/src/services/conversation.service.ts:finalizeOldConversations`
  - Critério de pronto: conversas antigas são finalizadas; auto_responding resetado
  - Confiança: 🟢

- [ ] T-11 — Implementar controllers REST: `listConversations`, `getConversation`, `pauseAutoResponding`, `resumeAutoResponding`, `takeOverConversation`, `finishConversation`, `markIntervention`, `pauseAllConversations`, `resumeAllConversations`, `sendMessage`, `sendMedia`, `createConversation`
  - Origem no legado: `backend/src/controllers/conversation.controller.ts`
  - Critério de pronto: cada controller delega ao service e retorna HTTP correto
  - Confiança: 🟢

- [ ] T-12 — Registrar rotas em `conversation.routes.ts` com middleware JWT
  - Origem no legado: `backend/src/routes/conversation.routes.ts`
  - Critério de pronto: todas as 12 rotas respondem conforme `contracts.md`
  - Confiança: 🟢

- [ ] T-13 — Integrar emissão de eventos Socket.IO em `conversation_updated` e `conversation_new`
  - Origem no legado: `backend/src/utils/conversationSocketEmitter.ts`
  - Critério de pronto: frontend recebe eventos em tempo real ao alterar conversa
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01 — Pipeline completo: mensagem recebida com auto_responding=true gera resposta IA
- [ ] TT-02 — Pipeline bloqueado: mensagem com auto_responding=false não gera resposta
- [ ] TT-03 — Comando `[ALERTA_ATENDENTE]` extraído e enviado, removido do texto ao cliente
- [ ] TT-04 — Comando `[ENVIAR_MIDIA:id]` extrai e envia mídia correta
- [ ] TT-05 — `#contatoia` omite histórico no contexto LLM
- [ ] TT-06 — Conversa inativa por >12h é finalizada pelo cron

## Ordem Sugerida

1. T-01, T-02 (models) — fundação de dados
2. T-03, T-04 (auto_responding) — controle simples
3. T-05, T-06, T-07 (parsers de comandos) — independentes
4. T-08, T-09 (pipeline principal) — depende de RAG, parsers, WhatsApp
5. T-10 (finalização automática) — background job
6. T-11, T-12 (controllers + rotas) — camada HTTP
7. T-13 (Socket.IO) — eventos em tempo real

## Lacunas Pendentes (🔴)

- **Status `paused`:** ENUM tem o valor mas nenhuma transição foi identificada — clarificar se será usado
- **`[CONTATO_PROATIVO]`:** comportamento exato (nova conversa ou mensagem direta?) precisa de validação
- **Mídias obrigatórias:** confirmar em que condição são enviadas (sempre? apenas na primeira mensagem?)
