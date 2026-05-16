# Mídia — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/medias`
> Autenticação: **obrigatória**

---

## POST /api/medias/upload

Upload de arquivo de mídia.

**Content-Type:** `multipart/form-data`  
**Form fields:** `file` (obrigatório)

**Response 201:**
```json
{
  "media": {
    "id": 1, "user_id": 1,
    "filename": "1716850000000-promo.mp4",
    "original_name": "promo.mp4",
    "file_type": "video",
    "source": "outgoing",
    "mandatory_send": false,
    "is_active": true,
    "indexing_status": "not_applicable"
  }
}
```

---

## GET /api/medias/list

Lista mídias do usuário.

**Response 200:** `Media[]`

---

## GET /api/medias/:id/file

Retorna o arquivo físico da mídia.

**Response 200:** arquivo binário com `Content-Type` correto  
**Response 404:** `{ "error": "Mídia não encontrada" }`

---

## PUT /api/medias/:id

Atualiza metadados da mídia.

**Request Body** (parcial):
```json
{ "mandatory_send": true, "is_active": true }
```

**Response 200:** `{ "media": Media }`

---

## DELETE /api/medias/:id

Remove mídia e arquivo físico.

**Response 200:** `{ "message": "Mídia removida" }`
