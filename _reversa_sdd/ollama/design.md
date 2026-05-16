# Ollama — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface HTTP (pública)

| Método | Caminho | Saída | Status codes |
|--------|---------|-------|--------------|
| GET | `/api/ollama/models` | `{ models: string[] }` | 200, 500 |
| GET | `/api/ollama/health` | `{ status: 'ok' \| 'error' }` | 200, 503 |

## Interface Interna (OllamaService)

| Função | Endpoint Ollama | Parâmetros | Retorno |
|--------|----------------|------------|---------|
| `generateEmbedding(text, model?)` | `POST /api/embeddings` | `{ model, prompt }` | `number[]` |
| `generateResponse(prompt, model?, options?)` | `POST /api/generate` | `{ model, prompt, stream: false, options }` | `string` |
| `listModels()` | `GET /api/tags` | — | `string[]` |

**Opções de geração (`options`):**
```ts
{
  temperature: number;   // default: 0.7
  top_p: number;         // default: 0.9
  top_k: number;         // default: 40
  repeat_penalty: number; // default: 1.1
}
```

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| HTTP keep-alive via `http.Agent` customizado | `ollama.service.ts` (maxSockets=5, keepAliveMsecs=1000) | 🟢 |
| `keep_alive: '5m'` no payload de geração | `ollama.service.ts` | 🟢 |
| Rotas públicas (sem JWT) — Ollama health é necessário na tela de login | `ollama.routes.ts:6` | 🟢 |
| `stream: false` — espera resposta completa antes de retornar | `ollama.service.ts` | 🟢 |

## Riscos e Lacunas

- 🟡 Timeout de 60s compartilhado com RAGService — se Ollama estiver lento, a resposta ao cliente também trava por 60s
- 🟡 `keep_alive='5m'` pode manter modelos pesados em GPU/RAM mesmo durante períodos ociosos
