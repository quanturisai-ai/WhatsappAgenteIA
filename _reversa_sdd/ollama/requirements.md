# Ollama — LLM Local

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/ollama.routes.ts`, `backend/src/controllers/ollama.controller.ts`, `backend/src/services/ollama.service.ts`

## Visão Geral

Módulo de integração com o Ollama — servidor local de LLMs. Expõe endpoints públicos (sem autenticação) para listar modelos disponíveis e verificar saúde do serviço. Internamente, o `OllamaService` é usado por `RAGService` para geração de embeddings e respostas de texto.

## Responsabilidades

- Listar modelos disponíveis no Ollama local
- Verificar saúde da conexão com o Ollama
- Gerar embeddings (chamado internamente por RAGService/IndexingService)
- Gerar respostas de texto (chamado internamente por RAGService)
- Manter HTTP keep-alive e modelo carregado em memória

## Regras de Negócio

- Rotas `/models` e `/health` são **públicas** — não requerem JWT 🟢
- URL do Ollama configurável via `OLLAMA_BASE_URL` (padrão: `http://localhost:11434`) 🟢
- HTTP keep-alive: `maxSockets=5`, `keepAliveMsecs=1000ms` 🟢
- Modelo mantido carregado em memória por `keep_alive='5m'` após uso 🟢
- Timeout de 60s por requisição de geração 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar modelos Ollama disponíveis | Must | GET /api/ollama/models retorna lista de modelos instalados |
| RF-02 | Verificar saúde do Ollama | Must | GET /api/ollama/health retorna status de conectividade |
| RF-03 | Gerar embedding de texto | Must | `generateEmbedding(text)` retorna vetor numérico |
| RF-04 | Gerar resposta de texto | Must | `generateResponse(prompt, options)` retorna string |

## Critérios de Aceitação

```gherkin
Dado que o Ollama está rodando localmente
Quando GET /api/ollama/health é chamado
Então a resposta é 200 com { status: "ok" }

Dado que o Ollama não está acessível
Quando GET /api/ollama/health é chamado
Então a resposta indica falha de conectividade
```

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/ollama.routes.ts` | 2 rotas públicas | 🟢 |
| `backend/src/controllers/ollama.controller.ts` | `listModels`, `checkHealth` | 🟢 |
| `backend/src/services/ollama.service.ts` | `OllamaService.generateEmbedding`, `generateResponse`, `listModels` | 🟢 |
