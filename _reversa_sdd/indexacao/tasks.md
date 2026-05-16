# Indexação — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] ChromaDB rodando e acessível (porta configurável via env)
- [ ] Ollama rodando com modelo de embeddings disponível
- [ ] Documentos e tópicos com tabelas criadas no banco

## Tarefas

- [ ] T-01 — Implementar `RAGService.query(message, userId)`: normalização → ChromaDB query → re-ranking híbrido → Ollama generate com timeout 60s
  - Origem: `backend/src/services/rag.service.ts`
  - Critério de pronto: mensagem de teste retorna resposta gerada pelo LLM em < 60s
  - Confiança: 🟢

- [ ] T-02 — Implementar normalização de query: lowercase + remove pontuação + stopwords PT-BR + filtro length > 2
  - Origem: `backend/src/services/rag.service.ts` (pipeline de normalização)
  - Critério de pronto: "Qual é o horário?" → tokens normalizados sem stopwords e pontuação
  - Confiança: 🟢

- [ ] T-03 — Implementar re-ranking: `score = 0.5×keyword + 0.3×vectorSim + 0.2×priority`
  - Origem: `backend/src/services/rag.service.ts`
  - Critério de pronto: itens com keyword match recebem score mais alto; ordem reflete pesos
  - Confiança: 🟢

- [ ] T-04 — Implementar `IndexingService.indexItem(type, id, userId)`: delega para service correto por tipo
  - Origem: `backend/src/services/indexing.service.ts`
  - Critério de pronto: indexação de documento, tópico e mídia funcionam via chamada única
  - Confiança: 🟢

- [ ] T-05 — Implementar `startIndexing()`: SELECT todos pendentes + loop de indexação
  - Origem: `backend/src/controllers/indexing.controller.ts:startIndexing`
  - Critério de pronto: após chamada, todos os itens pending estão indexed
  - Confiança: 🟢

- [ ] T-06 — Implementar controllers e rotas REST
  - Origem: `backend/src/controllers/indexing.controller.ts`
  - Critério de pronto: endpoints respondem conforme contracts.md
  - Confiança: 🟢

- [ ] T-07 — Configurar HTTP keep-alive no cliente HTTP do OllamaService: maxSockets=5, keepAliveMsecs=1000ms, keep_alive='5m'
  - Origem: `backend/src/services/ollama.service.ts`
  - Critério de pronto: conexões TCP reutilizadas entre requisições ao Ollama
  - Confiança: 🟢

## Lacunas Pendentes (🔴)

- Comportamento quando Ollama offline durante indexação — definir rollback ou retry
- Mecanismo de filtragem por tipo de conteúdo na coleção ChromaDB unificada — confirmar uso de metadata
