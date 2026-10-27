-- Migration: Nova classificação de conversas (Fase 2 do plano de melhoria do dashboard)
-- Ver: backend/PLANO_MELHORIA_CLASSIFICACAO_CONVERSAS.md
--
-- 100% aditiva: apenas ADD COLUMN com defaults neutros. Nenhuma coluna existente é
-- alterada, renomeada ou removida. Nenhum código em produção lê essas colunas ainda
-- (passam a ser preenchidas pelo backfill e, depois, pelo runtime na Fase 3/4).
--
-- messages.source: origem real da mensagem (substitui, na prática, a ambiguidade de
--   is_from_ai=0 nas mensagens outgoing, que hoje mistura atendente humano e disparos
--   automáticos de fidelização/campanha). NULL = legado, ainda não classificado pelo backfill.
--
-- conversations.handler: quem está com a conversa no momento (nenhum, IA, humano).
-- conversations.origin: como a conversa nasceu (orgânica, campanha, contato ativo).
-- conversations.last_client_message_at: última mensagem RECEBIDA do cliente — usada pelo
--   job de auto-finalização desde a Fase 1 (via subquery); esta coluna materializa o valor
--   para consulta rápida e para o Kanban futuro, evitando subquery em toda listagem.

ALTER TABLE messages
  ADD COLUMN source ENUM('client', 'ai', 'human', 'automation') NULL
    COMMENT 'Origem da mensagem. NULL = legado, classificado retroativamente pelo backfill.',
  ADD INDEX idx_source (source);

ALTER TABLE conversations
  ADD COLUMN handler ENUM('none', 'ai', 'human') NOT NULL DEFAULT 'none'
    COMMENT 'Quem está atendendo a conversa agora',
  ADD COLUMN origin ENUM('inbound', 'campaign', 'outbound') NOT NULL DEFAULT 'inbound'
    COMMENT 'Como a conversa nasceu: orgânica, campanha/fidelização ou contato ativo da empresa',
  ADD COLUMN last_client_message_at TIMESTAMP NULL
    COMMENT 'Última mensagem recebida do cliente (direction=incoming) — base da auto-finalização',
  ADD INDEX idx_handler (handler),
  ADD INDEX idx_last_client_message_at (last_client_message_at);
