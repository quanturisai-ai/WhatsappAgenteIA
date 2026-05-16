# Indexação — Motor RAG e Indexação ChromaDB

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/indexing.routes.ts`, `backend/src/controllers/indexing.controller.ts`, `backend/src/services/indexing.service.ts`, `backend/src/services/rag.service.ts`

## Visão Geral

Módulo que gerencia a indexação de conteúdo (documentos, tópicos, mídias) no ChromaDB e expõe o motor de busca semântica RAG (Retrieval-Augmented Generation). O RAGService implementa re-ranking híbrido com 3 componentes: match de palavras-chave, similaridade vetorial e prioridade configurada. Timeout de 60s por requisição de busca.

## Responsabilidades

- Listar conteúdo indexável (documentos, tópicos, mídias) com status de indexação
- Disparar indexação (embedding + inserção no ChromaDB) para itens específicos ou em lote
- Monitorar status de indexação em tempo real
- Executar busca híbrida (RAG) combinando ChromaDB + re-ranking
- Normalizar queries (lowercase, remoção de pontuação e stopwords PT-BR)

## Regras de Negócio

- Score de re-ranking = `(0.5 × trigger_keyword_match) + (0.3 × vector_similarity) + (0.2 × topic_priority)` 🟢
- Coleção ChromaDB por usuário: `user_{userId}` 🟢
- Normalização de query: lowercase → remove pontuação → remove stopwords PT-BR (~50 palavras) → filtra palavras com `length > 2` 🟢
- Timeout de 60 segundos via `Promise.race` — requisição ao Ollama abortada após este limite 🟢
- Pesos fixos hardcoded: `TRIGGER_KEYWORD_WEIGHT=0.5`, `VECTOR_SIMILARITY_WEIGHT=0.3`, `PRIORITY_WEIGHT=0.2` 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar conteúdo indexável com status | Must | GET /api/indexing/list retorna docs, tópicos e mídias com indexing_status |
| RF-02 | Verificar status de indexação | Must | GET /api/indexing/status retorna resumo atual |
| RF-03 | Disparar indexação em lote (reindex) | Should | POST /api/indexing/start inicia indexação de todos os pendentes |
| RF-04 | Indexar item específico por tipo e ID | Should | POST /api/indexing/:type/:id indexa item individual |
| RF-05 | Busca RAG com re-ranking híbrido | Must | `RAGService.query()` retorna trechos relevantes ordenados por score |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Performance | Timeout de 60s no pipeline RAG | `code-analysis.md` (RAGService timeout) | 🟢 |
| Performance | HTTP keep-alive para Ollama (maxSockets=5) | `code-analysis.md` (OllamaService) | 🟢 |
| Isolamento | Coleção ChromaDB por usuário | ADR-006, `code-analysis.md` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que existem documentos não indexados
Quando POST /api/indexing/start é chamado
Então os documentos são indexados (embeddings → ChromaDB) e indexing_status atualizado

Dado que uma mensagem chega com "qual o horário"
Quando RAGService.query() é executado com normalização
Então "horario" (sem acento, >2 chars) é usado na busca; stopwords removidas

Dado que o Ollama não responde em 60s
Quando RAGService.query() atinge o timeout
Então Promise.race rejeita e o pipeline retorna erro controlado
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Busca RAG (RF-05) | Must | Core da inteligência do agente |
| Listar conteúdo (RF-01) | Must | UI de gerenciamento |
| Status de indexação (RF-02) | Must | Monitoramento operacional |
| Indexação em lote (RF-03) | Should | Cômodo mas não crítico |
| Indexação individual (RF-04) | Should | Complementar ao lote |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/indexing.routes.ts` | 4 rotas | 🟢 |
| `backend/src/controllers/indexing.controller.ts` | `listIndexableContent`, `startIndexing`, `indexContent`, `getIndexingStatus` | 🟢 |
| `backend/src/services/rag.service.ts` | `RAGService.query()`, re-ranking híbrido, normalização de query | 🟢 |
