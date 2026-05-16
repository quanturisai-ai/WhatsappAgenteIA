# Indexação — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| GET | `/api/indexing/list` | — | `IndexableItem[]` | 200, 401 |
| GET | `/api/indexing/status` | — | `{ summary }` | 200, 401 |
| POST | `/api/indexing/start` | — | `{ message }` | 200, 401 |
| POST | `/api/indexing/:type/:id` | `type: 'document'|'topic'|'media'`, `id: number` | `{ message }` | 200, 400, 401, 404 |

## Algoritmo RAG — Busca Híbrida

```
RAGService.query(userMessage, userId):

1. Normalização da query:
   lowercase(userMessage)
   → remove pontuação
   → remove stopwords PT-BR (~50 palavras)
   → filtra tokens com length > 2
   → queryTokens[]

2. ChromaDB.query(collection='user_{userId}', queryEmbedding, nResults=10)
   → rawResults[] (com distância 0.0–2.0)

3. Para cada resultado:
   vectorSimilarity = 1 - (distance / 2)   // normaliza 0.0–1.0
   triggerKeywordMatch = intersecção(queryTokens, item.trigger_keywords) / total  // 0.0–1.0
   topicPriority = item.priority / 100       // 0.0–1.0

   score = (0.5 × triggerKeywordMatch)
         + (0.3 × vectorSimilarity)
         + (0.2 × topicPriority)

4. Ordena por score DESC

5. Monta contexto: top-N chunks + histórico de mensagens recentes

6. OllamaService.generateResponse(prompt_com_contexto)
   ↳ Promise.race([responsePromise, timeoutPromise(60s)])

7. Retorna resposta do LLM
```

## Fluxo de Indexação

```
POST /api/indexing/:type/:id
    │
    ▼
IndexingService.indexItem(type, id, userId)
    │
    ├── type='document' → DocumentService.indexDocument(id, userId)
    │     └── extractText → chunkText(1000) → OllamaService.generateEmbedding(chunk) × N
    │           └── ChromaDB.add(collection='user_{userId}', chunks, embeddings)
    │
    └── type='topic' → TopicService.indexTopic(id, userId)
          └── OllamaService.generateEmbedding(description)
                └── ChromaDB.add(collection='user_{userId}', [description], [embedding])
    │
    ▼
UPDATE indexing_status = 'indexed', indexed_at = NOW()
```

## Dependências

- `OllamaService` — geração de embeddings e respostas
- `ChromaDB Client` — armazenamento e busca de vetores
- `DocumentService`, `TopicService`, `MediaService` — fontes de conteúdo
- `MessageModel` — histórico de mensagens para contexto RAG

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| Pesos de re-ranking hardcoded (0.5/0.3/0.2) | `rag.service.ts` (TRIGGER_KEYWORD_WEIGHT etc.) | 🟢 |
| Uma coleção ChromaDB por usuário (não por tipo de conteúdo) | ADR-006, `code-analysis.md` | 🟢 |
| Timeout de 60s via Promise.race | `rag.service.ts` | 🟢 |
| HTTP keep-alive para Ollama: maxSockets=5, keepAliveMsecs=1000ms | `ollama.service.ts` | 🟢 |

## Riscos e Lacunas

- 🟡 Pesos de re-ranking hardcoded — não configuráveis pelo operador; mudança requer código
- 🟡 Uma única coleção por usuário mistura documentos, tópicos e mídias — filtragem por tipo usa metadata do ChromaDB (mecanismo exato não confirmado)
- 🔴 Comportamento quando Ollama está offline durante indexação — rollback ou retry?
