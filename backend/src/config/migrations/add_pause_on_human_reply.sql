-- Migration: Fase 4 do plano de melhoria de classificação de conversas
-- Ver: backend/PLANO_MELHORIA_CLASSIFICACAO_CONVERSAS.md
--
-- Quando um humano responde manualmente (dashboard ou direto no celular/WhatsApp Web),
-- o sistema agora pode pausar a resposta automática da IA para evitar resposta duplicada.
-- Esse é um comportamento novo e visível ao usuário final, então fica atrás de uma config
-- com default TRUE (ligado) que o usuário pode desligar.

ALTER TABLE agent_config
  ADD COLUMN pause_on_human_reply BOOLEAN NOT NULL DEFAULT TRUE
    COMMENT 'Pausar auto-resposta da IA quando um humano responde manualmente a conversa';
