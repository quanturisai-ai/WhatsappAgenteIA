# Documento — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Diretório `uploads/` existente e com permissão de escrita
- [ ] Tabela `documents` criada no banco
- [ ] ChromaDB acessível
- [ ] Ollama com modelo de embeddings disponível

## Tarefas

- [ ] T-01 — Configurar Multer: tipos permitidos (.txt, .pdf, .docx), limite 10MB, destino `uploads/`, nome `{timestamp}-{originalname}`
  - Origem no legado: `backend/src/controllers/document.controller.ts:getUploadMiddleware`
  - Critério de pronto: arquivo inválido rejeitado com 400; arquivo válido salvo em uploads/
  - Confiança: 🟢

- [ ] T-02 — Implementar `extractText(filePath, fileType)`: .txt via fs, .pdf via pdf-parse, .docx via mammoth
  - Origem no legado: `backend/src/services/document.service.ts:extractText`
  - Critério de pronto: texto extraído corretamente para cada formato
  - Confiança: 🟢

- [ ] T-03 — Implementar `chunkText(text, chunkSize=1000)`: divide texto em array de strings ≤ 1000 chars
  - Origem no legado: `backend/src/services/document.service.ts:chunkText`
  - Critério de pronto: texto de 3000 chars retorna 3 chunks; nenhum chunk ultrapassa 1000 chars
  - Confiança: 🟢

- [ ] T-04 — Implementar `indexDocument(documentId, userId)`: extractText → chunkText → embeddings → ChromaDB → UPDATE is_indexed
  - Origem no legado: `backend/src/services/document.service.ts:indexDocument`
  - Critério de pronto: após execução, documento marcado is_indexed=true e vetores disponíveis no ChromaDB
  - Confiança: 🟢

- [ ] T-05 — Implementar controllers e rotas REST (upload, list, delete)
  - Origem no legado: `backend/src/controllers/document.controller.ts`
  - Critério de pronto: endpoints respondem conforme contracts.md
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01 — Upload de .pdf válido retorna 201 com metadados
- [ ] TT-02 — Upload de .xlsx retorna 400
- [ ] TT-03 — Upload de arquivo > 10MB retorna 400
- [ ] TT-04 — Indexação de documento gera vetores consultáveis via RAGService

## Lacunas Pendentes (🔴)

- **Rota de indexação:** `POST /api/documents/:id/index` existe no code-analysis mas não no routes atual — confirmar se foi removida ou se indexação é só interna
