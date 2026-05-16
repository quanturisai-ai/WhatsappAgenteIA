# Ollama — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Ollama instalado e rodando (localhost:11434 ou configurado via OLLAMA_BASE_URL)
- [ ] Modelo de embedding e geração instalado no Ollama

## Tarefas

- [ ] T-01 — Implementar `OllamaService` com HTTP keep-alive (maxSockets=5, keepAliveMsecs=1000ms)
  - Origem: `backend/src/services/ollama.service.ts`
  - Critério de pronto: requisições ao Ollama reutilizam conexões TCP
  - Confiança: 🟢

- [ ] T-02 — Implementar `generateEmbedding(text, model?)`: POST /api/embeddings com keep_alive='5m'
  - Origem: `backend/src/services/ollama.service.ts:generateEmbedding`
  - Critério de pronto: retorna vetor numérico; modelo fica carregado por 5min após uso
  - Confiança: 🟢

- [ ] T-03 — Implementar `generateResponse(prompt, model?, options?)`: POST /api/generate com stream=false, timeout 60s
  - Origem: `backend/src/services/ollama.service.ts:generateResponse`
  - Critério de pronto: retorna string com resposta completa; timeout de 60s funciona
  - Confiança: 🟢

- [ ] T-04 — Implementar `listModels()`: GET /api/tags → retorna nomes dos modelos
  - Origem: `backend/src/services/ollama.service.ts:listModels`
  - Critério de pronto: retorna array de strings com modelos instalados
  - Confiança: 🟢

- [ ] T-05 — Implementar controllers `listModels` e `checkHealth` com rotas públicas (sem JWT)
  - Origem: `backend/src/routes/ollama.routes.ts:6`
  - Critério de pronto: endpoints acessíveis sem token de autenticação
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01 — Health check: resposta 200 com Ollama rodando; falha controlada sem Ollama
- [ ] TT-02 — Timeout: requisição de geração sem resposta em 60s retorna erro controlado
