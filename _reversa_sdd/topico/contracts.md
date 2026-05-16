# Tópico — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/topics`
> Autenticação: **obrigatória**

---

## GET /api/topics/list

Lista tópicos do usuário.

**Response 200:** `Topic[]`

---

## GET /api/topics/:id

Busca tópico por ID.

**Response 200:** `Topic`  
**Response 404:** `{ "error": "Tópico não encontrado" }`

---

## POST /api/topics

Cria novo tópico.

**Request Body:**
```json
{
  "title": "Horário de funcionamento",
  "description": "Atendemos de seg a sex das 8h às 18h",
  "trigger_keywords": ["horário", "funcionamento", "abre", "fecha"],
  "context": "custom",
  "priority": 80,
  "is_active": true
}
```

**Response 201:** `Topic`

---

## PUT /api/topics/:id

Atualiza tópico. Todos os campos são opcionais.

**Response 200:** `Topic`

---

## DELETE /api/topics/:id

Remove tópico e seus vetores do ChromaDB.

**Response 200:** `{ "message": "Tópico removido" }`
