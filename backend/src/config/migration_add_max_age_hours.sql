-- Migration: Adicionar campo max_age_hours na tabela agent_config
-- Este campo define a idade máxima em horas para:
-- 1. Histórico de mensagens no prompt (apenas últimas X horas)
-- 2. Finalização automática de conversas (conversas sem interação há mais de X horas)

ALTER TABLE agent_config 
ADD COLUMN max_age_hours INT DEFAULT 12 
COMMENT 'Idade máxima em horas para histórico de mensagens e finalização de conversas';

