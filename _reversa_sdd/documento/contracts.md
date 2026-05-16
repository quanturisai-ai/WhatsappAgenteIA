# Documento — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/documents`
> Autenticação: **obrigatória** em todas as rotas

---

## POST /api/documents/upload

Upload de documento para a base de conhecimento.

**Content-Type:** `multipart/form-data`

**Form fields:**
- `file` (obrigatório) — arquivo .txt, .pdf ou .docx, máximo 10MB

**Response 201:**
```json
{
  "document": {
    "id": 1,
    "user_id": 1,
    "filename": "1716850000000-manual.pdf",
    "original_name": "manual.pdf",
    "file_type": "pdf",
    "file_size": 204800,
    "file_path": "uploads/1716850000000-manual.pdf",
    "is_indexed": false,
    "indexed_at": null,
    "created_at": "2026-05-16T00:00:00.000Z"
  }
}
```

**Response 400 — Tipo inválido ou tamanho excedido:**
```json
{ "error": "Tipo de arquivo não permitido" }
```

---

## GET /api/documents/list

Lista todos os documentos do usuário.

**Response 200:**
```json
[
  {
    "id": 1,
    "original_name": "manual.pdf",
    "file_type": "pdf",
    "file_size": 204800,
    "is_indexed": true,
    "indexed_at": "2026-05-16T01:00:00.000Z",
    "created_at": "2026-05-16T00:00:00.000Z"
  }
]
```

---

## DELETE /api/documents/:id

Remove documento, arquivo físico e vetores do ChromaDB.

**Response 200:**
```json
{ "message": "Documento removido com sucesso" }
```

**Response 404:**
```json
{ "error": "Documento não encontrado" }
```
