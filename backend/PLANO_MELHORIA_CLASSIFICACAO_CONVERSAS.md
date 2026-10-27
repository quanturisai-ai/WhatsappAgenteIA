# Plano de Melhoria — Classificação de Conversas no Dashboard

> **Status:** PLANEJADO — nada foi implementado no sistema real ainda.
> **Validação prévia:** lógica proposta validada com 48 testes sintéticos (100% aprovados)
> e simulação read-only sobre os dados legados reais (1.114 conversas, 11.255 mensagens).
> **Regra de ouro:** todas as fases são aditivas e reversíveis; nenhuma altera
> comportamento de envio/recebimento do WhatsApp, RAG ou fidelização sem flag/fase própria.

---

## 1. Contexto — diagnóstico resumido

A classificação atual do Kanban ("Nova Interação" / "Em Atendimento" / "Finalizado" /
"Pendências") usa um único ENUM `conversations.status` que carrega três informações
diferentes (etapa do funil, quem atende e origem da conversa). Problemas confirmados:

| # | Problema | Onde acontece | Evidência nos dados reais |
|---|---|---|---|
| P1 | Disparos automáticos criam conversas `new` — cliente que só **recebeu** campanha aparece em "Nova Interação" | `whatsapp.service.ts:2479-2486` (handleOutgoingMessage cria conversa `new`) | **As 10 conversas hoje em "Nova Interação" são todas disparos em lote de 18/07** (criadas em segundos sequenciais, sem nenhuma fala do cliente) |
| P2 | `finishConversation` não limpa `needs_intervention` → card preso em "Pendências" para sempre | `conversation.service.ts:321-328` | **20 das 22 conversas em "Pendências" hoje são zumbis** (finalizadas com a flag ativa, algumas desde abril) |
| P3 | Job de auto-finalização usa `last_message_at`, que é renovado por qualquer outgoing (inclusive automação) → conversas ativas nunca finalizam se recebem disparos periódicos | `conversation.service.ts:347-434` + `whatsapp.service.ts:2727-2729` | 0 casos presos hoje (job está dando conta), mas a mecânica está errada e falha sob campanhas recorrentes |
| P4 | Status vira `in_progress` **antes** do RAG rodar → falha/timeout deixa "Em Atendimento" sem resposta enviada | `conversation.service.ts:130-133` | Mensagem "Tivemos uma instabilidade..." aparece 30x no histórico — as falhas existem |
| P5 | Mensagens de automação gravadas como se fossem humanas (`is_from_ai=0`) — impossível distinguir campanha de atendente | `fidelizacaoNotificacao.service.ts`, `fidelizacaoRegras.service.ts:138`, `fidelizacao.controller.ts:869`, scripts em lote | **2.222 mensagens** casam com `fidelizacao_notificacoes`; outras **~1.400** são blasts de promoção ("PROMOÇÃO RELÂMPAGO" 678x, "Páscoa" 685x) sem rastro nenhum |
| P6 | Atendente respondendo pelo celular não muda status nem pausa o bot | `handleOutgoingMessage` não seta status | 5.002 mensagens outgoing não-IA no histórico; nenhuma mudou classificação |
| P7 | Status `paused` existe no ENUM mas nunca é atribuído (estado morto) | schema + types | 0 conversas `paused` no banco |
| P8 | Alertas do sistema para o atendente (`🚨 ALERTA DE ATENDIMENTO`) são gravados como mensagem humana na conversa do próprio atendente | `humanAttendant.service.ts:139,168` | conv 624 ("Bárbara Mamãe") tem alerta como última mensagem — classificaria errado sem tratamento |

## 2. Objetivos e não-objetivos

**Objetivos**
1. Colunas do dashboard refletirem a realidade operacional: quem falou, quem está atendendo (IA ou humano), o que veio de campanha.
2. Mensagens automáticas totalmente rastreadas e neutras para o funil.
3. Corrigir os bugs P2/P4 imediatamente, sem depender da remodelagem.
4. Migração 100% reversível, sem tocar em nada que já funciona (envio, RAG, fidelização, sockets).

**Não-objetivos (fora de escopo)**
- Alterar a lógica do RAG, dos disparos de fidelização em si, ou da conexão WhatsApp.
- Criar novos fluxos de atendimento (fila, SLA etc.) — apenas classificar corretamente o que já existe.

## 3. Validação prévia realizada (antes de qualquer implementação)

Arquivos temporários criados (apagar ao final da implementação — **nenhum é importado pelo sistema real**):

| Arquivo | Papel | Resultado |
|---|---|---|
| `scripts/temp-classificacao-lib.ts` | Especificação executável da nova lógica (máquina de estados, deriveSource, replayHistory, auto-finalização) | Base dos dois testes abaixo |
| `scripts/temp-test-classificacao.ts` | 48 testes sintéticos cobrindo os 9 grupos de cenários (fluxo orgânico, falha de RAG, campanha, auto-finalização, humano, encerramento, proativo, backfill, replay) | **48/48 passaram** |
| `scripts/temp-sim-classificacao-legado.ts` | Simulação READ-ONLY sobre o banco real: reconstrói o estado proposto de cada conversa e compara com o atual | Relatório em `scripts/temp-sim-classificacao-relatorio.md` |
| `scripts/temp-sim-drilldown.ts` | Consultas read-only de aprofundamento (D1/D2/D3) | Achados incorporados abaixo |

**Resultados-chave da simulação com dados legados:**

- Distribuição derivada de sources: 2.259 `client`, 1.772 `ai`, 2.222 `automation` (fidelização), 5.002 "human" — dos quais ~1.400 são na verdade blasts de promoção sem registro (ver P5).
- Kanban proposto vs atual: apenas **13 conversas mudam de coluna de verdade**
  (10 "Nova Interação" → Finalizadas: são os disparos em lote de hoje;
  2 Finalizado → Humano atendendo: atendimentos recentes via celular invisíveis hoje;
  1 Em Atendimento → IA atendendo: renomeação com handler explícito).
  As demais 1.079 são a renomeação Finalizado→Finalizadas. **Ou seja: a mudança não bagunça o board — ela remove exatamente o ruído diagnosticado.**
- As 20 pendências-zumbi precisam de limpeza pontual (Fase 6), com revisão humana.
- Descoberta extra: conversas criadas por scripts de disparo em lote podem ficar **sem nenhuma linha em `messages`** (só a conversa `new` vazia) — a nova lógica trata (vira Finalizadas), mas o caminho de envio em lote precisa registrar a mensagem (Fase 3).

## 4. Desenho da solução

### 4.1 Modelo de dados (aditivo — nada é removido ou renomeado)

```sql
-- Migration: add_conversation_classification.sql
ALTER TABLE messages
  ADD COLUMN source ENUM('client','ai','human','automation') NULL
    COMMENT 'Origem da mensagem. NULL = legado (derivado no backfill)',
  ADD INDEX idx_source (source);

ALTER TABLE conversations
  ADD COLUMN handler ENUM('none','ai','human') NOT NULL DEFAULT 'none'
    COMMENT 'Quem tem a bola no atendimento',
  ADD COLUMN origin ENUM('inbound','campaign','outbound') NOT NULL DEFAULT 'inbound'
    COMMENT 'Como a conversa nasceu',
  ADD COLUMN last_client_message_at TIMESTAMP NULL
    COMMENT 'Última mensagem DO CLIENTE — base da auto-finalização',
  ADD INDEX idx_handler (handler),
  ADD INDEX idx_last_client_message_at (last_client_message_at);
```

- O ENUM `status` atual é **mantido** (`new` = aguardando resposta, `in_progress` = ativo, `finished` = encerrada). `paused` fica no ENUM porém documentado como aposentado — remover só numa migração futura, para não travar rollback.
- `is_from_ai` é mantido e continua sendo escrito (compatibilidade com queries existentes); `source` passa a ser a fonte da verdade.

### 4.2 Semântica dos sources

| source | Significado | Quem grava |
|---|---|---|
| `client` | Mensagem recebida do cliente | `handleIncomingMessage` |
| `ai` | Resposta da LLM (inclui contato proativo da IA) | `processIncomingMessage` / envio com `source='ai'` |
| `automation` | Disparo de sistema: fidelização, campanhas, **alertas ao atendente (P8)**, mensagens de instabilidade | serviços de fidelização, humanAttendant, scripts em lote |
| `human` | Atendente de verdade (dashboard ou celular) | `conversation.controller` (dashboard) e fallback do `handleOutgoingMessage` |

Regra do fallback em `handleOutgoingMessage`: se a mensagem outgoing não foi
pré-registrada por nenhum caminho do sistema (Map de pendências, ver 4.4), é
um humano digitando no celular/WhatsApp Web → `source='human'`.

### 4.3 Máquina de estados (validada nos 48 testes)

| Evento | Efeito |
|---|---|
| Cliente manda mensagem | `last_client_message_at` atualiza; `finished`→`new` (reabertura); se `in_progress` mantém (a bola já é de alguém) |
| Resposta da IA **enviada com sucesso** | `status='in_progress'`, `handler='ai'` (nunca antes do envio — corrige P4) |
| RAG falha/timeout | `needs_intervention=true` (hoje: silêncio) |
| Disparo de automação | Atualiza só `last_message_at`; **não** muda status/handler; se cria conversa: `status='finished'`, `origin='campaign'` (corrige P1) |
| Humano responde (dashboard ou celular) | `status='in_progress'`, `handler='human'`, `auto_responding=false` (corrige P6) |
| "Assumir conversa" | idem acima (comportamento atual mantido) |
| "Encerrar atendimento" | `status='finished'`, `handler='none'`, `auto_responding=true`, **`needs_intervention=false`** (corrige P2) |
| `[ALERTAR_ATENDENTE]` | `needs_intervention=true` (mantido) |
| Job de inatividade | Finaliza se `last_client_message_at` (fallback `last_message_at` se nunca houve cliente) > `max_age_hours` (corrige P3) |

### 4.4 Rastreamento no envio (substitui a gambiarra dos hashes apenas conceitualmente — o mecanismo existente é reaproveitado)

`WhatsAppService.sendMessage/sendMedia` ganham parâmetro opcional
`source?: 'ai' | 'human' | 'automation'` (default derivado do `isFromAI` atual —
**assinatura retrocompatível, nenhum call site quebra**). O Map `pendingAIMessages`
é generalizado para `pendingSources: Map<string, MessageSource>` mantendo as
mesmas chaves (message_id + hashes de conteúdo) já usadas hoje.

Call sites a atualizar (todos passam a declarar sua origem):

| Origem | Arquivos |
|---|---|
| `ai` | `conversation.service.ts:227,288,293` (já `isFromAI=true` — sem mudança de comportamento) |
| `human` | `conversation.controller.ts:553` (envio pelo dashboard) |
| `automation` | `fidelizacaoNotificacao.service.ts` (6 pontos), `fidelizacaoRegras.service.ts:138`, `fidelizacao.controller.ts:869`, `humanAttendant.service.ts:139,168`, `scripts/send_bulk_notifications.ts`, `scripts/notificar-progresso-offline.ts` |

### 4.5 Nova classificação no Kanban

| Coluna | Critério | Cor sugerida |
|---|---|---|
| Pendências | `needs_intervention = true` | vermelho (mantida) |
| Aguardando resposta *(substitui "Nova Interação")* | `status='new'` — cliente falou e ninguém respondeu | amarelo |
| IA atendendo | `status='in_progress'` e `handler='ai'` | verde |
| Humano atendendo | `status='in_progress'` e `handler='human'` | azul |
| Finalizadas | `status='finished'` | cinza |

Badges no card: origem (📣 campanha / 💬 orgânica / 📤 ativa) e handler (🤖/👤).
Métricas desbloqueadas: tempo de primeira resposta, taxa de retorno de campanha,
taxa de transbordo IA→humano.

## 5. Fases de implementação

Cada fase é independente, tem verificação própria e pode ser revertida sem afetar as demais.

### Fase 0 — Salvaguardas (antes de qualquer código)
1. Backup do banco: `mysqldump agente_zap conversations messages fidelizacao_notificacoes`.
2. Branch dedicada (`feature/classificacao-conversas`); nunca commitar direto na main.
3. Congelar os scripts temporários como oráculo: eles serão reexecutados após cada fase.

### Fase 1 — Correções de bug sem mudança de schema (baixo risco, valor imediato)
1. **P2:** `finishConversation` passa a gravar `needs_intervention: false` (`conversation.service.ts:321-328`).
2. **P4:** mover o `update({status:'in_progress'})` de `processIncomingMessage` (linha 130) para **depois** do envio bem-sucedido; no `catch` do RAG, gravar `needs_intervention: true`.
3. **P3 (versão sem schema):** `finalizeOldConversations` passa a comparar contra a última mensagem `direction='incoming'` (subquery em `messages`) em vez de `last_message_at`.

*Verificação:* rodar `temp-test-classificacao.ts` (cenários 2, 4, 6 são o contrato);
teste manual: encerrar uma conversa com pendência → card sai de "Pendências";
simular falha de RAG (desligar Ollama) → conversa vira pendência, não "Em Atendimento".

*O que não pode quebrar:* fluxo de resposta automática. Mitigação: o update de status
é a única mudança de ordem; envio e RAG permanecem intocados.

### Fase 2 — Schema + backfill (sem mudança de comportamento)
1. Aplicar a migration 4.1 (colunas novas, todas com default — **zero impacto** em código existente).
2. Script de backfill (novo, `src/scripts/backfill-classificacao.ts`), portando `deriveSource`/`replayHistory` da lib temporária já validada:
   - `messages.source`: incoming→`client`; `is_from_ai=1`→`ai`; match com `fidelizacao_notificacoes.mensagem_enviada` (normalizado)→`automation`; **heurística adicional validada no drill-down:** conteúdo outgoing não-IA repetido em ≥5 conversas distintas→`automation` (captura os blasts de promoção); resto→`human`.
   - `conversations.last_client_message_at`: `MAX(created_at) WHERE direction='incoming'`.
   - `conversations.origin`: primeira mensagem `automation`→`campaign`; primeira `human/ai` outgoing→`outbound`; senão `inbound`. Conversa sem mensagens criada em lote→`campaign`.
   - `conversations.handler`: derivado do replay (última fonte atendente em conversas `in_progress`).
   - Dry-run obrigatório: o script imprime o diff e só grava com `--apply`.

*Verificação:* reexecutar `temp-sim-classificacao-legado.ts` — a distribuição proposta
deve bater com o que o backfill gravou (mesmos números do relatório).

### Fase 3 — Rastreamento no envio (runtime)
1. `sendMessage`/`sendMedia` com parâmetro `source` opcional (4.4) e `pendingSources`.
2. Atualizar os call sites da tabela 4.4 — mecânico, um por um.
3. `messageModel.create` grava `source` (e mantém `is_from_ai` para compatibilidade).
4. Scripts de disparo em lote passam a registrar a mensagem em `messages` com `source='automation'` (corrige a descoberta das conversas vazias).

*Verificação:* enviar 1 mensagem de cada tipo (IA respondendo, dashboard, notificação
de fidelização em modo simulação→real controlado, alerta de atendente) e conferir
`SELECT source FROM messages ORDER BY id DESC LIMIT 5`.

*O que não pode quebrar:* deduplicação de mensagens e detecção de mídia por hash —
por isso o Map atual é generalizado, não substituído.

### Fase 4 — Novas transições de estado
1. `handleOutgoingMessage`: mensagem sem source pré-registrado → `human` → `in_progress` + `handler='human'` + `auto_responding=false`. **Atrás de config** (`agent_config.pause_on_human_reply`, default ON) porque pausar a IA quando o dono responde pelo celular é mudança de comportamento visível — o usuário pode desligar.
2. Disparo de automação para número sem conversa → cria com `status='finished'`, `origin='campaign'` (P1).
3. Automação deixa de renovar o critério de inatividade (job passa a usar `last_client_message_at`, substituindo a subquery da Fase 1).
4. `handler='ai'` gravado junto com o `in_progress` pós-envio da Fase 1.

*Verificação:* reexecutar os 48 testes (contrato integral) + teste ao vivo com o
número de teste (`5561981935443`, mesmo padrão do `temp-test-lid-fix.ts`): responder
pelo celular e ver o card mover para "Humano atendendo" com bot pausado.

### Fase 5 — Frontend
1. `KanbanBoard.tsx`: 5 colunas conforme 4.5 (filtros por `status`+`handler`).
2. `ConversationCard.tsx`: badges de origem e handler.
3. `types` do frontend + `conversation.service.ts` (frontend) para expor `handler`/`origin`.
4. Socket events (`conversation:updated`) já carregam o card completo — apenas incluir os campos novos no `getConversationCardById`.

*Verificação:* board com dados reais pós-backfill; conferir que as 13 conversas
migradas aparecem nas colunas previstas pela simulação.

### Fase 6 — Limpeza e encerramento
1. Revisão humana das 20 pendências-zumbi (lista no relatório): resolver via endpoint existente ou em lote com aprovação.
2. Documentar o modelo novo no README/CLAUDE do projeto.
3. **Apagar os 5 arquivos temporários** (`temp-classificacao-lib.ts`, `temp-test-classificacao.ts`, `temp-sim-classificacao-legado.ts`, `temp-sim-drilldown.ts`, `temp-sim-classificacao-relatorio.md`) — antes disso, portar os 48 cenários para testes permanentes se o projeto adotar test runner.

## 6. Matriz de riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Backfill classificar errado mensagens antigas | Cards em coluna errada | Dry-run com diff + simulação já validada; `source=NULL` permanece como "legado desconhecido" em caso de dúvida (tratado como `human`) |
| Pausar IA quando humano responde causar surpresa | Cliente sem resposta automática | Config `pause_on_human_reply` (default documentado) + retomada automática no encerramento (comportamento atual do finish já reativa) |
| Mudança na ordem do update de status atrasar resposta | Nenhum — update é pós-envio | Envio não depende do status; testes de fluxo cobertos |
| Quebrar deduplicação de mensagens (hashes) | Mensagens duplicadas no board | Map generalizado mantendo chaves idênticas; teste de eco do WhatsApp na Fase 3 |
| Job finalizar conversa com cliente ativo | Conversa some do board ativo | Regra usa `last_client_message_at` — validada no cenário 4 (4.3/4.4/4.5) |
| Migration travar tabela grande | Downtime | 11k mensagens / 1k conversas — ALTER instantâneo nesse volume |
| Rollback necessário | — | Fases 1–4 revertem por git; colunas novas podem ficar órfãs sem efeito (defaults neutros); ENUM não foi alterado |

## 7. Critérios de aceite finais

1. Nenhuma conversa criada por disparo aparece em "Aguardando resposta" sem fala do cliente.
2. Encerrar atendimento remove o card de "Pendências".
3. Falha de RAG gera pendência visível em vez de falso "Em Atendimento".
4. Responder pelo celular move o card para "Humano atendendo" e pausa a IA (se config ativa).
5. Toda mensagem nova tem `source` preenchido; relatório de fontes sem `NULL` em mensagens novas.
6. Job de inatividade finaliza por inatividade **do cliente**, imune a disparos.
7. Os 48 testes sintéticos continuam passando contra o código real portado.

---

*Anexos: relatório da simulação em `scripts/temp-sim-classificacao-relatorio.md`;
diagnóstico completo na conversa de 18/07/2026.*
