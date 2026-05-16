# Ollama — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/ollama`
> Autenticação: **não requerida** (rotas públicas)

---

## GET /api/ollama/models

Lista modelos disponíveis no Ollama local.

**Response 200:**
```json
{
  "models": ["deepseek-r1", "llama3", "nomic-embed-text"]
}
```

**Response 500 — Ollama inacessível:**
```json
{ "error": "Erro ao conectar ao Ollama" }
```

---

## GET /api/ollama/health

Verifica conectividade com o Ollama.

**Response 200 — Ollama acessível:**
```json
{ "status": "ok", "url": "http://localhost:11434" }
```

**Response 503 — Ollama inacessível:**
```json
{ "status": "error", "message": "Ollama não está acessível" }
```
