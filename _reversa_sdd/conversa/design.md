# Conversa — Design Técnico

> Gerado pelo Writer (Reversa) em 2026-05-16
> Rastreabilidade: `backend/src/services/conversation.service.ts`, `backend/src/controllers/conversation.controller.ts`, `backend/src/models/conversation.model.ts`

## Interface

| Método | Caminho | Entrada | Saída | Status codes |
|--------|---------|---------|-------|--------------|
| GET | `/api/conversations` | — | `Conversation[]` | 200, 401 |
| POST | `/api/conversations` | `{ contact_number, contact_name? }` | `Conversation` | 201, 400, 401 |
| GET | `/api/conversations/:id` | `id: number` | `Conversation + messages[]` | 200, 401, 404 |
| POST | `/api/conversations/:id/pause` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/conversations/:id/resume` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/conversations/:id/takeover` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/conversations/:id/finish` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/conversations/:id/mark-intervention` | `id: number` | `{ message }` | 200, 401, 404 |
| POST | `/api/conversations/pause-all` | — | `{ message }` | 200, 401 |
| POST | `/api/conversations/resume-all` | — | `{ message }` | 200, 401 |
| POST | `/api/conversations/send` | `{ conversationId, content }` | `{ message }` | 200, 400, 401 |
| POST | `/api/conversations/send-media` | `{ conversationId, mediaId }` | `{ message }` | 200, 400, 401 |

**Tipo `Conversation`:**
```ts
{
  id: number;
  user_id: number;
  contact_number: string;
  contact_name: string | null;
  lid: string | null;
  status: 'new' | 'in_progress' | 'paused' | 'finished';
  auto_responding: boolean;
  last_message_at: Date | null;
  needs_intervention: boolean;
  intervention_resolved_at: Date | null;
  // Campos enriquecidos via LEFT JOIN vm_lav_clientes
  cliente_nome?: string;
  cliente_cpf?: string;
}
```

## Fluxo Principal — Processamento de Mensagem Recebida

1. `WhatsAppService` recebe evento `message` e chama `ConversationService.processIncomingMessage(userId, conversationId, content, wpService)`
2. `isAutoResponding(conversationId)` verifica `auto_responding` no banco — se `false`, pipeline é abortado
3. Se `auto_responding=true`, verifica se há mídias obrigatórias configuradas (`AgentConfigService`) e as envia primeiro via `wpService.sendMedia()`
4. Chama `RAGService.query(content, userId)` que consulta ChromaDB + histórico de mensagens e chama Ollama
5. `extractAlertCommand(response)` verifica e extrai `[ALERTA_ATENDENTE:msg]` da resposta
6. `extractMediaCommands(response)` verifica e extrai `[ENVIAR_MIDIA:id]` da resposta
7. `extractProactiveContactCommand(response)` verifica e extrai `[CONTATO_PROATIVO:numero]` da resposta
8. Cada comando extraído é executado (envio de alerta, mídia, contato proativo)
9. Resposta limpa (sem comandos) é enviada ao cliente via `wpService.sendMessage()`
10. Mensagem de resposta é persistida no banco (`MessageModel.create()`)

## Fluxo Principal — Pause/Resume

1. Controller valida `id` da conversa e extrai `userId` do token
2. Chama `ConversationService.pauseAutoResponding(conversationId)` ou `resumeAutoResponding()`
3. UPDATE no banco: `auto_responding = 0` ou `1`
4. Evento Socket.IO `conversation_updated` é emitido ao frontend

## Fluxo Principal — Finalização Automática

1. `finalizeOldConversations()` é chamada como background job periódico
2. SELECT conversas com `status = 'in_progress'` e `last_message_at < NOW() - max_age_hours`
3. Para cada conversa: UPDATE `status='finished'`, `auto_responding=true`
4. Evento `conversation_updated` emitido para cada conversa finalizada

## Fluxos Alternativos

- **`#contatoia` na mensagem do cliente:** histórico de mensagens não é incluído no contexto enviado ao LLM — modo "fresh context" 🟢
- **`[CONTATO_PROATIVO:{...}]`:** envia mensagem diretamente ao número externo via `whatsappService.sendMessage()` — **não** cria uma nova conversa; aceita formatos `[CONTATO_PROATIVO: {...}]`, `["CONTATO_PROATIVO": {...}]` e variantes 🟢
- **Conversa `finished` recebe nova mensagem:** `processIncomingMessage()` reabre a conversa (UPDATE status `in_progress`) antes de processar 🟢
- **`needs_intervention=true`:** IA pode continuar respondendo mesmo com flag ativa — a flag apenas sinaliza para o painel humano, não bloqueia a IA 🟡

## Dependências

- `RAGService` — pipeline de consulta semântica (ChromaDB) + geração de resposta (Ollama)
- `AgentConfigService` — configurações do agente (mídias obrigatórias, prompt base, max_age_hours)
- `HumanAttendantService` — envio de alertas para atendentes humanos
- `WhatsAppService` — envio de mensagens e mídias ao WhatsApp
- `ConversationModel` — CRUD de conversas com LEFT JOIN vm_lav_clientes
- `MessageModel` — persistência de mensagens
- `Socket.IO` — emissão de eventos ao frontend

## Decisões de Design Identificadas

| Decisão | Evidência no código | Confiança |
|---------|---------------------|-----------|
| `auto_responding=null` no banco é tratado como `true` | `conversation.service.ts:isAutoResponding` | 🟢 |
| Comandos especiais embutidos no texto da IA (inline commands) | `conversation.service.ts:extractAlertCommand, extractMediaCommands` | 🟢 |
| LEFT JOIN com vm_lav_clientes via função SQL normaliza_telefone | `conversation.model.ts:findById` | 🟢 |
| Status `paused` no ENUM: **intenção confirmada** — deve ser usado quando um atendente humano assume a conversa (takeover), pausando a IA. Porém o código atual não faz UPDATE para `paused` na operação de takeover — apenas seta `auto_responding=false`. Transição não implementada | `state-machines.md` (confirmado pelo usuário) | 🟡 |
| `finalizeOldConversations` com max_age_hours configurável via AgentConfig | `conversation.service.ts` | 🟡 |

## Estado Interno

Stateless no nível do service — todo estado persiste no banco. O `WhatsAppService` mantém o debounce em memória que eventualmente dispara `processIncomingMessage`.

## Observabilidade

| Evento Socket.IO | Quando |
|-----------------|--------|
| `conversation_new` | Nova conversa criada por mensagem recebida |
| `conversation_updated` | Status, auto_responding ou needs_intervention alterado |
| `message_new` | Nova mensagem recebida ou enviada |

## Riscos e Lacunas

- 🔴 Estado `paused` do ENUM `conversations.status` não tem gatilhos de entrada/saída identificados no código — requer validação humana (ver `questions.md#pergunta-1`)
- 🟢 `[CONTATO_PROATIVO:{...}]` — envia mensagem direta via `sendMessage()`, não cria conversa; confirmado em `conversation.service.ts:211-234`
- 🟡 O valor padrão de `max_age_hours` (12h) é configurável mas o mecanismo de configuração depende de `AgentConfig` — se não configurado, pode usar hardcoded
- 🟢 Mídias obrigatórias: enviadas na 1ª mensagem do cliente OU se penúltima mensagem foi há mais de `max_age_hours`; controlado por `shouldSend` em `conversation.service.ts:473-498`
