# Conversa — Gestão de Conversas e Pipeline de IA

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/routes/conversation.routes.ts`, `backend/src/controllers/conversation.controller.ts`, `backend/src/services/conversation.service.ts`

## Visão Geral

Módulo central do sistema. Gerencia o ciclo de vida de conversas entre o agente WhatsApp e contatos externos. Implementa o pipeline completo de processamento de mensagens recebidas: verificação de auto-responding → envio de mídias obrigatórias → chamada ao LLM via RAG → parsing de comandos especiais → envio de resposta. Também controla pausas/retomadas da IA por conversa e sinalização de intervenção humana.

## Responsabilidades

- Listar e buscar conversas do usuário autenticado
- Criar conversas manualmente (além da criação automática por mensagem recebida)
- Pausar e retomar resposta automática da IA por conversa individual ou em bloco
- Assumir conversa (takeover humano) e finalizá-la
- Marcar e resolver intervenções (alertas de atendente humano)
- Enviar mensagens e mídias manualmente pelo operador via API
- Executar o pipeline de processamento de mensagens recebidas do WhatsApp
- Interpretar comandos especiais embutidos nas respostas da IA
- Finalizar conversas inativas automaticamente (cron / background job)

## Regras de Negócio

- `auto_responding` é `true` por padrão — mesmo quando o campo é `null` no banco, a IA responde 🟢
- Quando IA está ativa (`auto_responding=true`) e uma mensagem chega, o pipeline completo é executado 🟢
- O texto `#contatoia` na mensagem do cliente omite o histórico ao chamar o LLM (modo "fresh context") 🟢
- Comandos especiais `[ALERTA_ATENDENTE:msg]`, `[ENVIAR_MIDIA:id]`, `[CONTATO_PROATIVO:numero]` são extraídos e removidos da resposta antes de enviar ao cliente 🟢
- Conversas inativas por mais de `max_age_hours` (padrão: 12h) são finalizadas automaticamente 🟢
- `findById` faz LEFT JOIN com `vm_lav_clientes` via função SQL `normaliza_telefone()` para enriquecer dados do contato 🟢
- `status=finished` reseta `auto_responding=true` para que a IA retome na próxima mensagem do contato 🟢
- Uma conversa `finished` reabre automaticamente (`in_progress`) ao receber nova mensagem 🟢
- O estado `paused` existe no ENUM `conversations.status` mas sem transições identificadas no código atual 🔴

## Requisitos Funcionais

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| RF-01 | Listar todas as conversas do usuário | Must | GET /api/conversations retorna array de conversas com metadados |
| RF-02 | Buscar conversa específica com mensagens | Must | GET /api/conversations/:id retorna conversa com histórico |
| RF-03 | Pausar auto-responding de uma conversa | Must | POST /:id/pause define auto_responding=false |
| RF-04 | Retomar auto-responding de uma conversa | Must | POST /:id/resume define auto_responding=true |
| RF-05 | Assumir conversa (takeover humano) | Should | POST /:id/takeover pausa IA e marca conversa como sob controle humano |
| RF-06 | Finalizar conversa manualmente | Should | POST /:id/finish muda status para finished |
| RF-07 | Marcar necessidade de intervenção humana | Should | POST /:id/mark-intervention define needs_intervention=true |
| RF-08 | Pausar auto-responding em todas as conversas | Could | POST /pause-all define auto_responding=false em todas |
| RF-09 | Retomar auto-responding em todas as conversas | Could | POST /resume-all define auto_responding=true em todas |
| RF-10 | Enviar mensagem manualmente pelo operador | Should | POST /send envia mensagem de texto via WhatsApp |
| RF-11 | Enviar mídia manualmente pelo operador | Should | POST /send-media envia arquivo de mídia via WhatsApp |
| RF-12 | Criar conversa manualmente | Could | POST / cria conversa sem mensagem prévia |
| RF-13 | Processar mensagem recebida com pipeline de IA | Must | `processIncomingMessage()` executa pipeline completo ao receber mensagem |
| RF-14 | Interpretar e executar comandos especiais da IA | Must | Comandos `[ALERTA_ATENDENTE]`, `[ENVIAR_MIDIA]`, `[CONTATO_PROATIVO]` são parseados e executados |
| RF-15 | Finalizar conversas inativas automaticamente | Should | `finalizeOldConversations()` encerra conversas sem atividade por >12h |

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confiança |
|------|--------------------|---------------------|-----------|
| Segurança | Todas as rotas requerem autenticação JWT | `conversation.routes.ts:14` | 🟢 |
| Performance | Pipeline de IA é assíncrono — não bloqueia a thread principal | `conversation.service.ts` (async/await) | 🟢 |
| Disponibilidade | `finalizeOldConversations()` é chamada como background job periódico | `index.ts` | 🟡 |

## Critérios de Aceitação

```gherkin
Dado que o usuário está autenticado
Quando GET /api/conversations é chamado
Então a resposta é 200 com array de conversas do usuário

Dado que uma conversa existe
Quando POST /api/conversations/:id/pause é chamado
Então auto_responding=false e a IA não responde à próxima mensagem

Dado que uma conversa está pausada
Quando POST /api/conversations/:id/resume é chamado
Então auto_responding=true e a IA volta a responder

Dado que uma mensagem chega com auto_responding=true
Quando processIncomingMessage() é executado
Então a IA gera resposta via RAG/LLM e envia ao contato no WhatsApp

Dado que a resposta da IA contém [ALERTA_ATENDENTE:mensagem]
Quando o pipeline de conversa processa a resposta
Então o alerta é enviado ao atendente e o comando é removido do texto enviado ao cliente

Dado que a resposta da IA contém [ENVIAR_MIDIA:id]
Quando o pipeline de conversa processa a resposta
Então a mídia com o ID correspondente é enviada via WhatsApp

Dado que uma conversa está inativa por mais de 12h
Quando finalizeOldConversations() é executado
Então o status muda para "finished" e auto_responding é resetado para true
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
|-----------|--------|---------------|
| Pipeline de IA (RF-13, RF-14) | Must | Funcionalidade core do produto |
| Listar/buscar conversas (RF-01, RF-02) | Must | Interface depende disto |
| Pause/resume individual (RF-03, RF-04) | Must | Controle humano essencial |
| Takeover e finalização (RF-05, RF-06) | Should | Gestão de atendimento humano |
| Finalização automática (RF-15) | Should | Limpeza operacional |
| Envio manual (RF-10, RF-11) | Should | Operador precisa responder |
| Pause/resume em bloco (RF-08, RF-09) | Could | Convenience feature |
| Criação manual (RF-12) | Could | Raramente necessário |

## Rastreabilidade de Código

| Arquivo | Função / Classe | Cobertura |
|---------|-----------------|-----------|
| `backend/src/routes/conversation.routes.ts` | 12 rotas registradas | 🟢 |
| `backend/src/controllers/conversation.controller.ts` | `listConversations`, `getConversation`, `pauseAutoResponding`, `resumeAutoResponding`, `takeOverConversation`, `finishConversation`, `markIntervention`, `sendMessage`, `sendMedia`, `createConversation`, `pauseAllConversations`, `resumeAllConversations` | 🟢 |
| `backend/src/services/conversation.service.ts` | `processIncomingMessage`, `isAutoResponding`, `pauseAutoResponding`, `finalizeOldConversations`, `extractAlertCommand`, `extractMediaCommands`, `extractProactiveContactCommand` | 🟢 |
| `backend/src/models/conversation.model.ts` | `ConversationModel.findById` (LEFT JOIN vm_lav_clientes) | 🟢 |
