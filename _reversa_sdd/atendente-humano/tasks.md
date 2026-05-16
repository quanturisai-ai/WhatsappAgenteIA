# Atendente Humano — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Tabelas `human_attendants` e `attendant_alerts` criadas no banco
- [ ] `WhatsAppService` disponível para envio de mensagens

## Tarefas

- [ ] T-01 — Implementar CRUD: `getAttendants`, `createAttendant`, `updateAttendant`, `deleteAttendant`
  - Origem: `backend/src/services/humanAttendant.service.ts`
  - Critério de pronto: CRUD completo com isolamento por userId
  - Confiança: 🟢

- [ ] T-02 — Implementar `HumanAttendantService.sendAlert(userId, conversationId, alertMessage)`: SELECT ativos → envio WhatsApp → registro de alerta → UPDATE needs_intervention
  - Origem: `backend/src/services/humanAttendant.service.ts:sendAlert`
  - Critério de pronto: atendente recebe mensagem WhatsApp com contexto do alerta
  - Confiança: 🟢

- [ ] T-03 — Implementar `sendTestMessage(attendantId)`: envia mensagem de teste para validar configuração
  - Origem: `backend/src/controllers/humanAttendant.controller.ts:sendTestMessage`
  - Critério de pronto: atendente recebe mensagem de teste no WhatsApp
  - Confiança: 🟢

- [ ] T-04 — Implementar `getAlertsByConversation(conversationId)` e `resolveIntervention(conversationId)`
  - Origem: `backend/src/controllers/humanAttendant.controller.ts`
  - Critério de pronto: alertas listados por conversa; resolve atualiza needs_intervention=false
  - Confiança: 🟢

## Lacunas Pendentes (🔴)

- Definir estratégia quando múltiplos atendentes estão ativos: broadcast (todos recebem) ou seleção de um
