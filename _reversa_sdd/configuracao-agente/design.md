# Configuração do Agente — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| GET | `/api/agent-config` | — | `AgentConfig` | 200, 401 |
| PUT | `/api/agent-config` | `Partial<AgentConfig>` | `AgentConfig` | 200, 401, 500 |
| POST | `/api/agent-config` | `Partial<AgentConfig>` | `AgentConfig` | 200, 401, 500 |

**Tipo `AgentConfig`:**
```ts
{
  id: number;
  user_id: number;
  business_name: string | null;
  business_info: string | null;
  services: string | null;
  hours: string | null;
  personality: string | null;
  greeting_message: string | null;
  farewell_message: string | null;
  absence_message: string | null;
  specific_instructions: string | null;
  embedding_model: string;       // padrão: 'deepseek-r1'
  generation_model: string;      // padrão: 'deepseek-r1'
  temperature: number;           // padrão: 0.7
  top_p: number;                 // padrão: 0.9
  top_k: number;                 // padrão: 40
  repeat_penalty: number;        // padrão: 1.1
  max_age_hours: number;         // padrão: 12
}
```

## Fluxo Principal

1. Controller extrai `userId` do token JWT
2. `AgentConfigService.getConfig(userId)` busca registro no banco
3. Se não encontrar, cria com valores padrão (INSERT com defaults)
4. Para PUT/POST: `AgentConfigService.updateConfig(userId, data)` faz UPDATE com os campos fornecidos (parcial)
5. Retorna configuração atual

## Dependências

- MariaDB (pool) — persistência da configuração
- `ConversationService` — consome `max_age_hours`
- `OllamaService` — consome `embedding_model`, `generation_model`, `temperature`, `top_p`, `top_k`, `repeat_penalty`
- `ConversationService.processIncomingMessage` — consome `greeting_message`, `business_name`, etc. para montar o prompt

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| POST e PUT mapeiam para o mesmo controller | `agentConfig.routes.ts:12-13` | 🟢 |
| Um registro por usuário (não por sessão) | schema da tabela (user_id UNIQUE) | 🟡 |

## Riscos e Lacunas

- 🟡 Lógica de "criar se não existir" (upsert) — confirmar se é INSERT explícito ou ON DUPLICATE KEY UPDATE
- 🟡 Validação de range dos parâmetros LLM (temperatura 0.0–2.0) — não confirmada no controller
