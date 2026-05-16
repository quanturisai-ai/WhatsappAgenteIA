# Documento — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/services/document.service.ts`, `backend/src/controllers/document.controller.ts`

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| POST | `/api/documents/upload` | `multipart/form-data: file` | `{ document }` | 201, 400, 401, 500 |
| GET | `/api/documents/list` | — | `Document[]` | 200, 401 |
| DELETE | `/api/documents/:id` | `id: number` | `{ message }` | 200, 401, 404, 500 |

**Tipo `Document`:**
```ts
{
  id: number;
  user_id: number;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  is_indexed: boolean;
  indexed_at: Date | null;
  created_at: Date;
}
```

## Fluxo Principal — Upload

1. Middleware `getUploadMiddleware()` (Multer) valida tipo e tamanho (max 10MB) antes do controller
2. Controller extrai `userId`, `filename`, `originalname`, `mimetype`, `size`, `path` do `req.file`
3. `DocumentService.create()` insere metadados no banco com `is_indexed=false`
4. Retorna 201 com objeto do documento criado

## Fluxo Principal — Indexação

1. `DocumentService.indexDocument(documentId, userId)` busca o registro do banco
2. `extractText(filePath, fileType)` extrai texto conforme formato:
   - `.txt`: `fs.readFileSync()`
   - `.pdf`: `pdf-parse(buffer)`
   - `.docx`: `mammoth.extractRawText({ path })`
3. `chunkText(text, 1000)` divide em array de strings ≤ 1000 chars
4. Para cada chunk: `OllamaService.generateEmbedding(chunk)` gera vetor
5. `ChromaDBService.add(collection: 'user_{userId}_documents', chunks, embeddings, metadata)` insere vetores
6. UPDATE banco: `is_indexed=true`, `indexed_at=NOW()`

## Fluxo Principal — Exclusão

1. Controller valida `id` e `userId`
2. `DocumentService.delete(id, userId)` busca o registro
3. `ChromaDBService.delete(collection, documentId)` remove vetores do ChromaDB
4. `fs.unlinkSync(filePath)` remove arquivo físico
5. DELETE do registro no banco

## Dependências

- `Multer` — middleware de upload com validação de tipo e tamanho
- `pdf-parse` — extração de texto de PDF
- `mammoth` — extração de texto de DOCX
- `OllamaService` — geração de embeddings
- `ChromaDBService` — armazenamento e busca de vetores

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Chunk size hardcoded em 1000 chars | `document.service.ts:chunkText(text, 1000)` | 🟢 |
| Nome do arquivo: `{timestamp}-{originalname}` | `document.controller.ts` (Multer config) | 🟢 |
| Coleção ChromaDB: `user_{userId}_documents` | ADR-006, `code-analysis.md` | 🟢 |
| Indexação não é automática no upload — requer chamada explícita | `document.routes.ts` (ausência de rota de indexação automática) | 🟡 |

## Riscos e Lacunas

- 🟡 Indexação não é automática no upload — confirmação de quando o operador dispara a indexação
- 🟡 Falha durante indexação (ex: Ollama offline) — comportamento de rollback não confirmado
- 🔴 A rota `POST /api/documents/:id/index` está referenciada no `code-analysis.md` mas não aparece no `document.routes.ts` atual — possível divergência ou remoção
