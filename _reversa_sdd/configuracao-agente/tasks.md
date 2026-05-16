# Configuração do Agente — Tarefas de Implementação

> Gerado pelo Writer (Reversa) em 2026-05-16

## Pré-requisitos

- [ ] Tabela `agent_configs` criada no banco com todos os campos e valores padrão

## Tarefas

- [ ] T-01 — Implementar `AgentConfigService.getConfig(userId)`: SELECT + INSERT padrão se não existir
  - Origem no legado: `backend/src/services/agentConfig.service.ts`
  - Critério de pronto: sempre retorna um objeto de configuração; nunca retorna null
  - Confiança: 🟢

- [ ] T-02 — Implementar `AgentConfigService.updateConfig(userId, data)`: UPDATE parcial dos campos fornecidos
  - Origem no legado: `backend/src/services/agentConfig.service.ts`
  - Critério de pronto: apenas campos enviados são atualizados; outros mantêm valor atual
  - Confiança: 🟢

- [ ] T-03 — Implementar controllers `getAgentConfig` e `updateAgentConfig`
  - Origem no legado: `backend/src/controllers/agentConfig.controller.ts`
  - Critério de pronto: GET retorna config atual; PUT/POST atualiza e retorna nova config
  - Confiança: 🟢

- [ ] T-04 — Registrar rotas (GET /, PUT /, POST /) com JWT
  - Origem no legado: `backend/src/routes/agentConfig.routes.ts`
  - Critério de pronto: endpoints acessíveis conforme contracts.md
  - Confiança: 🟢

## Tarefas de Teste

- [ ] TT-01 — GET sem config prévia cria e retorna registro padrão
- [ ] TT-02 — PUT com temperature=0.5 persiste apenas o campo alterado

## Lacunas Pendentes (🔴)

- Confirmar mecanismo de upsert: INSERT explícito ou INSERT ... ON DUPLICATE KEY UPDATE
