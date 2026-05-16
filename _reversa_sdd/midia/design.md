# Mídia — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/medias/upload` | `multipart/form-data: file` | `{ media }` | 201, 400, 401 |
| GET | `/api/medias/list` | — | `Media[]` | 200, 401 |
| GET | `/api/medias/:id/file` | `id: number` | arquivo binário | 200, 401, 404 |
| PUT | `/api/medias/:id` | `Partial<Media>` | `{ media }` | 200, 401, 404 |
| DELETE | `/api/medias/:id` | `id: number` | `{ message }` | 200, 401, 404 |

**Tipo `Media`:**
```ts
{
  id: number;
  user_id: number;
  filename: string;
  original_name: string;
  file_type: 'video' | 'image' | 'document' | 'audio';
  source: 'outgoing' | 'incoming';
  file_path: string;
  file_size: number;
  mime_type: string;
  mandatory_send: boolean;
  is_active: boolean;
  indexing_status: 'pending' | 'indexed' | 'failed' | 'not_applicable';
  created_at: Date;
}
```

## Fluxo Principal — Upload

1. Multer valida tipo e salva em `uploads/medias/` com nome `{timestamp}-{originalname}`
2. Controller insere metadados no banco com `source='outgoing'`, `mandatory_send=false`, `is_active=true`
3. `indexing_status` iniciado como `'pending'` ou `'not_applicable'` conforme o tipo

## Fluxo Principal — Envio de Mídia Obrigatória

1. `ConversationService.processIncomingMessage()` chama `sendMandatoryMedias(userId, wpService)`
2. SELECT mídias com `mandatory_send=true AND is_active=true` do userId
3. Para cada mídia: `wpService.sendMedia(contact_number, filePath, mimeType)`

## Dependências

- `Multer` — middleware de upload
- `WhatsAppService.sendMedia()` — envio via WhatsApp
- `ConversationService` — dispara envio de mídias obrigatórias

## Riscos e Lacunas

- 🟡 Limite de tamanho de arquivo para mídias não confirmado (diferente dos 10MB dos documentos?)
- 🟡 `indexing_status = 'pending'` implica indexação assíncrona — mecanismo de disparo não confirmado
