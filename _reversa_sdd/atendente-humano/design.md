# Atendente Humano — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| GET | `/api/human-attendant` | — | `HumanAttendant[]` | 200, 401 |
| POST | `/api/human-attendant` | `{ phone_number, name? }` | `HumanAttendant` | 201, 400, 401 |
| PUT | `/api/human-attendant/:id` | `Partial<HumanAttendant>` | `HumanAttendant` | 200, 401, 404 |
| DELETE | `/api/human-attendant/:id` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/human-attendant/test` | `{ attendantId }` | `{ message }` | 200, 400, 401 |
| GET | `/api/human-attendant/alerts/conversation/:id` | `conversationId: number` | `Alert[]` | 200, 401 |
| POST | `/api/human-attendant/conversation/:id/resolve` | `conversationId: number` | `{ message }` | 200, 401, 404 |

**Tipo `HumanAttendant`:**
```ts
{
  id: number;
  user_id: number;
  phone_number: string;
  name: string | null;
  is_active: boolean;
  created_at: Date;
}
```

## Fluxo Principal — Envio de Alerta

1. `ConversationService.processIncomingMessage()` extrai `[ALERTA_ATENDENTE:mensagem]` da resposta da IA
2. `HumanAttendantService.sendAlert(userId, conversationId, alertMessage)` é chamado
3. SELECT atendentes com `is_active=true` e `user_id=userId`
4. Para cada atendente ativo: `WhatsAppService.sendMessage(attendant.phone_number, formattedAlert)`
5. Alerta registrado na tabela de alertas
6. UPDATE `conversations.needs_intervention=true`

## Dependências

- `WhatsAppService` — envio de mensagens WhatsApp para o atendente
- `ConversationService` — atualização de `needs_intervention` na conversa

## Riscos e Lacunas

- 🔴 Comportamento com múltiplos atendentes ativos não confirmado — broadcast para todos? roundrobin? primeiro ativo?
- 🟡 Comportamento quando WhatsApp não está conectado no momento do alerta — erro silencioso ou fila?
