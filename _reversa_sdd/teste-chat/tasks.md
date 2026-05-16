# Teste de Chat — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] `RAGService` disponível
- [ ] `AgentConfigService` disponível

## Tarefas

- [ ] T-01 — Implementar `TestChatService.sendMessage(userId, message)`: usa RAGService com contexto isolado
  - Origem: `backend/src/services/testChat.service.ts`
  - Critério de pronto: resposta gerada pelo mesmo pipeline RAG das conversas reais
  - Confiança: 🟢

- [ ] T-02 — Implementar `clearTestChat(userId)`: limpa histórico de teste
  - Origem: `backend/src/services/testChat.service.ts`
  - Critério de pronto: após limpeza, próximo POST começa sem contexto anterior
  - Confiança: 🟢

- [ ] T-03 — Implementar `getTestLogInfo(userId)`: retorna metadados da última geração
  - Origem: `backend/src/controllers/testChat.controller.ts:getTestLogInfo`
  - Critério de pronto: GET /log-info retorna tempo, modelo e outras métricas
  - Confiança: 🟡

## Lacunas Pendentes (🔴)

- Confirmar se histórico de teste é em memória ou banco (impacta comportamento após restart)
