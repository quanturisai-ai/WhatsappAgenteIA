# Configuração do Agente — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/agent-config`
> Autenticação: **obrigatória**

---

## GET /api/agent-config

Retorna configuração atual do agente IA do usuário.

**Response 200:**
```json
{
  "id": 1,
  "user_id": 1,
  "business_name": "Lavanderia XYZ",
  "business_info": "Lavanderia de roupas e tapetes",
  "services": "Lavagem, secagem, passagem",
  "hours": "Seg-Sex 8h-18h, Sab 8h-13h",
  "personality": "Profissional e simpático",
  "greeting_message": "Olá! Como posso ajudar?",
  "farewell_message": "Obrigado pelo contato!",
  "absence_message": "Estamos fora do horário de atendimento.",
  "specific_instructions": null,
  "embedding_model": "deepseek-r1",
  "generation_model": "deepseek-r1",
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "repeat_penalty": 1.1,
  "max_age_hours": 12
}
```

---

## PUT /api/agent-config (equivalente a POST /api/agent-config)

Atualiza parcialmente a configuração do agente.

**Request Body** (`application/json`) — todos os campos são opcionais:
```json
{
  "business_name": "Lavanderia XYZ",
  "temperature": 0.5,
  "max_age_hours": 24
}
```

**Response 200:** `AgentConfig` atualizado (mesmo schema do GET)
