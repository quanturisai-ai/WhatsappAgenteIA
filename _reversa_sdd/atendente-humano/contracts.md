# Atendente Humano — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/human-attendant`
> Autenticação: **obrigatória**

---

## GET /api/human-attendant

Lista atendentes humanos cadastrados.

**Response 200:**
```json
[
  { "id": 1, "phone_number": "5511999999999", "name": "Ana", "is_active": true }
]
```

---

## POST /api/human-attendant

Cadastra novo atendente.

**Request Body:** `{ "phone_number": "5511999999999", "name": "Ana" }`

**Response 201:** `HumanAttendant`

---

## PUT /api/human-attendant/:id

Atualiza atendente.

**Response 200:** `HumanAttendant`

---

## DELETE /api/human-attendant/:id

Remove atendente.

**Response 200:** `{ "message": "Atendente removido" }`

---

## POST /api/human-attendant/test

Envia mensagem de teste para o atendente.

**Request Body:** `{ "attendantId": 1 }`

**Response 200:** `{ "message": "Mensagem de teste enviada" }`

---

## GET /api/human-attendant/alerts/conversation/:id

Lista alertas gerados para a conversa.

**Response 200:**
```json
[
  { "id": 1, "conversation_id": 5, "message": "Cliente sem resposta", "created_at": "..." }
]
```

---

## POST /api/human-attendant/conversation/:id/resolve

Resolve (fecha) a intervenção da conversa.

**Response 200:** `{ "message": "Intervenção resolvida" }`
