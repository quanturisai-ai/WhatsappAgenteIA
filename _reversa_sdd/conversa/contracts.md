# Conversa — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/conversations`
> Autenticação: **obrigatória** em todas as rotas

---

## GET /api/conversations

Lista todas as conversas do usuário.

**Response 200:**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "contact_number": "5511999999999",
    "contact_name": "João Silva",
    "status": "in_progress",
    "auto_responding": true,
    "needs_intervention": false,
    "last_message_at": "2026-05-16T12:00:00.000Z"
  }
]
```

---

## POST /api/conversations

Cria conversa manualmente.

**Request Body:**
```json
{ "contact_number": "5511999999999", "contact_name": "João Silva" }
```

**Response 201:** `{ Conversation }`

---

## GET /api/conversations/:id

Busca conversa com histórico de mensagens e dados do cliente (via LEFT JOIN vm_lav_clientes).

**Response 200:**
```json
{
  "id": 1,
  "contact_number": "5511999999999",
  "status": "in_progress",
  "auto_responding": true,
  "cliente_nome": "João Silva",
  "cliente_cpf": "123.456.789-00",
  "messages": [
    {
      "id": 1,
      "content": "Olá",
      "direction": "incoming",
      "is_from_ai": false,
      "received_at": "2026-05-16T12:00:00.000Z"
    }
  ]
}
```

**Response 404:** `{ "error": "Conversa não encontrada" }`

---

## POST /api/conversations/:id/pause

Pausa a IA para a conversa.

**Response 200:** `{ "message": "Auto-responding pausado" }`

---

## POST /api/conversations/:id/resume

Retoma a IA para a conversa.

**Response 200:** `{ "message": "Auto-responding retomado" }`

---

## POST /api/conversations/:id/takeover

Operador assume o controle da conversa (pausa IA + marca takeover).

**Response 200:** `{ "message": "Conversa assumida" }`

---

## POST /api/conversations/:id/finish

Finaliza a conversa manualmente.

**Response 200:** `{ "message": "Conversa finalizada" }`

---

## POST /api/conversations/:id/mark-intervention

Marca que a conversa precisa de intervenção humana.

**Response 200:** `{ "message": "Intervenção marcada" }`

---

## POST /api/conversations/pause-all

Pausa auto-responding em **todas** as conversas do usuário.

**Response 200:** `{ "message": "Todas as conversas pausadas" }`

---

## POST /api/conversations/resume-all

Retoma auto-responding em **todas** as conversas do usuário.

**Response 200:** `{ "message": "Auto-responding retomado em todas as conversas" }`

---

## POST /api/conversations/send

Envia mensagem de texto manualmente pelo operador.

**Request Body:**
```json
{ "conversationId": 1, "content": "Olá, como posso ajudar?" }
```

**Response 200:** `{ "message": "Mensagem enviada" }`

---

## POST /api/conversations/send-media

Envia mídia manualmente pelo operador.

**Request Body:**
```json
{ "conversationId": 1, "mediaId": 5 }
```

**Response 200:** `{ "message": "Mídia enviada" }`

---

## Eventos Socket.IO emitidos por este módulo

| Evento | Payload | Quando |
|--------|---------|--------|
| `conversation_new` | `{ conversation }` | Nova conversa criada por mensagem recebida |
| `conversation_updated` | `{ conversation }` | Status ou flags alterados |
| `message_new` | `{ message, conversationId }` | Nova mensagem recebida ou enviada |
