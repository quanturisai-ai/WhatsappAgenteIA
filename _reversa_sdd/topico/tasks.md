# Tópico — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Tabela `topics` criada com suporte a JSON para `trigger_keywords`
- [ ] ChromaDB acessível para indexação

## Tarefas

- [ ] T-01 — Implementar CRUD: `listTopics`, `getTopic`, `createTopic`, `updateTopic`, `deleteTopic`
  - Origem: `backend/src/services/topic.service.ts`
  - Critério de pronto: CRUD completo com isolamento por userId
  - Confiança: 🟢

- [ ] T-02 — Implementar serialização/deserialização de `trigger_keywords` (JSON ↔ string[])
  - Origem: `backend/src/models/topic.model.ts` (inferido)
  - Critério de pronto: campo retornado como array JS, não string JSON
  - Confiança: 🟡

- [ ] T-03 — Implementar indexação de tópicos no ChromaDB
  - Origem: `backend/src/services/topic.service.ts` (indexing_status)
  - Critério de pronto: após indexação, tópico aparece em buscas RAG
  - Confiança: 🟡

- [ ] T-04 — Registrar rotas com JWT middleware
  - Origem: `backend/src/routes/topic.routes.ts`
  - Critério de pronto: endpoints respondem conforme contracts.md
  - Confiança: 🟢

## Lacunas Pendentes (🔴)

- Nome exato da coleção ChromaDB para tópicos — confirmar no código de indexação
