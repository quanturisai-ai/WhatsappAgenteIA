# Atendente Humano — Gestão de Atendentes e Alertas

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/humanAttendant.routes.ts`, `backend/src/controllers/humanAttendant.controller.ts`, `backend/src/services/humanAttendant.service.ts`

## Visão Geral

Módulo que gerencia atendentes humanos cadastrados no sistema. Quando a IA detecta que uma conversa precisa de intervenção humana (via comando `[ALERTA_ATENDENTE:mensagem]`), o `HumanAttendantService.sendAlert()` envia uma mensagem WhatsApp diretamente ao número do atendente ativo. Também gerencia alertas por conversa e resolução de intervenções.

## Responsabilidades

- CRUD de atendentes humanos (nome, número WhatsApp, ativo/inativo)
- Envio de mensagem de teste para validar configuração do atendente
- Listar alertas gerados por conversa
- Resolver (fechar) intervenções abertas
- Receber e executar alertas disparados pela IA via `[ALERTA_ATENDENTE]`

## Regras de Negócio

- Alertas são enviados via WhatsApp para o número do atendente com `is_active=true` 🟢
- Se nenhum atendente ativo estiver cadastrado, o alerta é ignorado (ou logado) 🟡
- `sendTestMessage()` permite validar o número sem precisar de uma conversa real 🟢
- `resolveIntervention()` marca `needs_intervention=false` na conversa e registra `intervention_resolved_at` 🟢
- Múltiplos atendentes podem ser cadastrados — com múltiplos ativos o alerta é enviado por **broadcast** (todos recebem simultaneamente via `Promise.all`) 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar atendentes humanos | Must | GET / retorna lista de atendentes com is_active |
| RF-02 | Cadastrar atendente | Must | POST / cria atendente com phone_number e name |
| RF-03 | Atualizar atendente | Should | PUT /:id atualiza dados do atendente |
| RF-04 | Excluir atendente | Should | DELETE /:id remove atendente |
| RF-05 | Enviar mensagem de teste | Should | POST /test envia mensagem WhatsApp ao atendente |
| RF-06 | Listar alertas por conversa | Must | GET /alerts/conversation/:id retorna alertas da conversa |
| RF-07 | Resolver intervenção | Must | POST /conversation/:id/resolve fecha alerta e atualiza conversa |

## Critérios de Aceitação

```gherkin
Dado que a IA emite [ALERTA_ATENDENTE:Cliente sem resposta]
Quando HumanAttendantService.sendAlert() é executado
Então uma mensagem WhatsApp é enviada ao número do atendente ativo com a mensagem do alerta

Dado que uma intervenção está aberta em uma conversa
Quando POST /api/human-attendant/conversation/:id/resolve é chamado
Então needs_intervention=false e intervention_resolved_at é registrado
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/humanAttendant.routes.ts` | 7 rotas | 🟢 |
| `backend/src/controllers/humanAttendant.controller.ts` | `getAttendants`, `createAttendant`, `updateAttendant`, `deleteAttendant`, `sendTestMessage`, `getAlertsByConversation`, `resolveIntervention` | 🟢 |
| `backend/src/services/humanAttendant.service.ts` | `HumanAttendantService.sendAlert()` | 🟢 |
