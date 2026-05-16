# Indexação — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/indexing`
> Autenticação: **obrigatória**

---

## GET /api/indexing/list

Lista todo conteúdo indexável do usuário (documentos, tópicos, mídias).

**Response 200:**
```json
[
  { "id": 1, "type": "document", "name": "manual.pdf", "indexing_status": "indexed" },
  { "id": 2, "type": "topic", "name": "Horário", "indexing_status": "pending" },
  { "id": 3, "type": "media", "name": "promo.mp4", "indexing_status": "not_applicable" }
]
```

---

## GET /api/indexing/status

Retorna resumo do estado de indexação.

**Response 200:**
```json
{
  "total": 10,
  "indexed": 8,
  "pending": 2,
  "failed": 0
}
```

---

## POST /api/indexing/start

Inicia indexação de todos os itens com `indexing_status = 'pending'`.

**Response 200:**
```json
{ "message": "Indexação iniciada" }
```

---

## POST /api/indexing/:type/:id

Indexa item específico.

**Path params:** `type` = `document` | `topic` | `media`, `id` = número

**Response 200:**
```json
{ "message": "Item indexado com sucesso" }
```

**Response 400:** `{ "error": "Tipo inválido" }`  
**Response 404:** `{ "error": "Item não encontrado" }`
