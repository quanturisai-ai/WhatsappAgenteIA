# Configuração do Agente — Personalização do Agente IA

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/agentConfig.routes.ts`, `backend/src/controllers/agentConfig.controller.ts`, `backend/src/services/agentConfig.service.ts`

## Visão Geral

Módulo que gerencia as configurações do agente IA: identidade do negócio, comportamento da IA, parâmetros do LLM e limites operacionais. Estas configurações alimentam o prompt base enviado ao Ollama e controlam variáveis como temperatura, modelos usados e tempo máximo de inatividade de conversas.

## Responsabilidades

- Ler e atualizar configurações do agente para o usuário autenticado
- Fornecer dados de identidade do negócio (nome, serviços, horário) para o prompt base
- Configurar parâmetros do LLM (modelo, temperatura, top_p, top_k, repeat_penalty)
- Definir mensagens padrão (saudação, despedida, ausência)
- Controlar `max_age_hours` para finalização automática de conversas

## Regras de Negócio

- Um registro de `AgentConfig` por usuário — na primeira busca, se não existir, o controller **retorna defaults em memória sem persistir** (objeto padrão com embeddingModel=`deepseek-r1`, temperature=0.7, maxAgeHours=12 etc.) — **não** insere no banco 🟢. Criação real só acontece via PUT/POST
- Modelo padrão: `'deepseek-r1'` para embedding e geração 🟢
- Temperatura padrão: `0.7` 🟢
- `max_age_hours` padrão: `12` horas 🟢
- POST e PUT são equivalentes — ambos mapeiam para `updateAgentConfig` 🟢

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Ler configuração atual do agente | Must | GET /api/agent-config retorna objeto completo de configuração |
| RF-02 | Atualizar configuração do agente | Must | PUT /api/agent-config persiste alterações e retorna configuração atualizada |
| RF-03 | Criar configuração padrão se não existir | Should | Primeira leitura cria registro com valores padrão |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Rotas requerem JWT | `agentConfig.routes.ts:7` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que o usuário está autenticado
Quando GET /api/agent-config é chamado
Então a resposta é 200 com objeto de configuração completo

Dado que o usuário atualiza temperature para 0.5
Quando PUT /api/agent-config com { temperature: 0.5 } é chamado
Então a configuração é atualizada e GET retorna temperature=0.5

Dado que o usuário ainda não tem configuração
Quando GET /api/agent-config é chamado pela primeira vez
Então um registro padrão é criado e retornado
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Leitura (RF-01) | Must | RAGService e ConversationService dependem das configs |
| Atualização (RF-02) | Must | Único meio de personalizar o agente |
| Auto-criação (RF-03) | Should | Melhora UX mas pode ser manual |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/agentConfig.routes.ts` | `GET /`, `PUT /`, `POST /` (alias) | 🟢 |
| `backend/src/controllers/agentConfig.controller.ts` | `getAgentConfig`, `updateAgentConfig` | 🟢 |
| `backend/src/models/agentConfig.model.ts` | `AgentConfigModel.findByUserId`, `update` — **não há service layer** | 🟢 |
