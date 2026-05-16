# Teste de Chat — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/test-chat`
> Autenticação: **obrigatória**

---

## POST /api/test-chat

Envia mensagem de teste e recebe resposta do agente IA.

**Request Body:**
```json
{ "message": "Qual é o horário de funcionamento?" }
```

**Response 200:**
```json
{
  "response": "Atendemos de segunda a sexta das 8h às 18h.",
  "logInfo": {
    "model": "deepseek-r1",
    "responseTimeMs": 1240,
    "chunksUsed": 3
  }
}
```

---

## DELETE /api/test-chat

Limpa o histórico de conversa de teste do usuário.

**Response 200:**
```json
{ "message": "Histórico de teste limpo" }
```

---

## GET /api/test-chat/log-info

Retorna informações de log da última geração.

**Response 200:**
```json
{
  "logInfo": {
    "model": "deepseek-r1",
    "lastResponseTimeMs": 1240,
    "lastChunksUsed": 3
  }
}
```
