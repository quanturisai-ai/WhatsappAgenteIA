# Documento — Base de Conhecimento

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/document.routes.ts`, `backend/src/controllers/document.controller.ts`, `backend/src/services/document.service.ts`

## Visão Geral

Módulo que gerencia documentos de conhecimento (.txt, .pdf, .docx) usados para alimentar o sistema RAG. Permite upload, listagem, exclusão e indexação de documentos no ChromaDB. É a principal fonte de conhecimento estruturado para o agente IA responder perguntas sobre o negócio.

## Responsabilidades

- Receber upload de documentos (txt, pdf, docx) com limite de 10 MB
- Persistir arquivo físico em `uploads/` e metadados no banco
- Listar documentos do usuário com status de indexação
- Excluir documento e seus vetores do ChromaDB
- Extrair texto do documento e dividi-lo em chunks de 1000 chars
- Gerar embeddings via Ollama e indexar no ChromaDB

## Regras de Negócio

- Tipos permitidos: `.txt`, `.pdf`, `.docx` — outros formatos rejeitados no middleware Multer 🟢
- Limite de tamanho: **10 MB** por arquivo 🟢
- Chunk size hardcoded: **1000 caracteres** 🟢
- Nome do arquivo físico: `{timestamp}-{originalname}` — armazenado em `uploads/` 🟢
- Coleção ChromaDB por usuário: `user_{userId}_documents` — isolamento total entre usuários 🟢
- Exclusão remove arquivo físico + vetores ChromaDB + registro no banco 🟡

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Upload de documento | Must | POST /api/documents/upload retorna 201 com metadados do documento criado |
| RF-02 | Listar documentos do usuário | Must | GET /api/documents/list retorna array com status de indexação |
| RF-03 | Excluir documento | Should | DELETE /api/documents/:id remove arquivo, vetores ChromaDB e registro |
| RF-04 | Extrair texto do documento | Must | `extractText()` suporta .txt, .pdf (pdf-parse), .docx (mammoth) |
| RF-05 | Dividir texto em chunks | Must | `chunkText(text, 1000)` retorna array de strings ≤ 1000 chars |
| RF-06 | Indexar documento no ChromaDB | Must | `indexDocument(id, userId)` gera embeddings e insere vetores |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Todas as rotas requerem JWT | `document.routes.ts:7` | 🟢 |
| Performance | Limite de 10MB previne uploads pesados | `document.controller.ts:getUploadMiddleware` | 🟢 |
| Isolamento | Coleção ChromaDB por usuário (`user_{userId}_documents`) | `code-analysis.md` ADR-006 | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o usuário faz upload de um PDF de 5MB
Quando POST /api/documents/upload é chamado com multipart/form-data
Então o arquivo é salvo em uploads/ e metadados retornados com status 201

Dado que um documento .xlsx (formato inválido) é enviado
Quando POST /api/documents/upload é chamado
Então a resposta é 400 com erro de tipo de arquivo

Dado que um documento existe com ID 1
Quando DELETE /api/documents/1 é chamado
Então o arquivo físico, vetores no ChromaDB e registro no banco são removidos

Dado que um documento de texto é indexado
Quando indexDocument(id, userId) é chamado
Então embeddings são gerados para cada chunk de 1000 chars e inseridos no ChromaDB
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Upload (RF-01) | Must | Porta de entrada do conhecimento |
| Extração + chunking (RF-04, RF-05) | Must | Prerequisito para indexação |
| Indexação ChromaDB (RF-06) | Must | Sem isso o RAG não funciona |
| Listagem (RF-02) | Must | UI de gerenciamento |
| Exclusão (RF-03) | Should | Importante mas não bloqueia |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/document.routes.ts` | 3 rotas | 🟢 |
| `backend/src/controllers/document.controller.ts` | `uploadDocument`, `listDocuments`, `deleteDocument`, `getUploadMiddleware` | 🟢 |
| `backend/src/services/document.service.ts` | `extractText`, `chunkText`, `indexDocument` | 🟢 |
