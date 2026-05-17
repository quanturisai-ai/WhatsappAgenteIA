-- Migration: Suporte a mídias recebidas de clientes no dashboard
-- Data: 2026-01-31
-- Descrição:
--   1. Adiciona 'audio' ao ENUM message_type da tabela messages
--   2. Adiciona 'audio' ao ENUM file_type da tabela medias
--   3. Adiciona coluna 'source' à tabela medias para diferenciar mídias enviadas (outgoing) das recebidas (incoming)

-- ===================================================
-- 1. Alterar ENUM message_type em messages para incluir 'audio'
-- ===================================================
ALTER TABLE messages
  MODIFY COLUMN message_type ENUM('text', 'audio', 'media', 'reaction', 'system', 'location', 'contact', 'other') DEFAULT 'text';

-- ===================================================
-- 2. Alterar ENUM file_type em medias para incluir 'audio'
-- ===================================================
ALTER TABLE medias
  MODIFY COLUMN file_type ENUM('video', 'image', 'document', 'audio') NOT NULL;

-- ===================================================
-- 3. Adicionar coluna source à tabela medias
-- ===================================================
ALTER TABLE medias
  ADD COLUMN IF NOT EXISTS source VARCHAR(10) NOT NULL DEFAULT 'outgoing' AFTER file_type;

-- Garantir que registros existentes tenham source = 'outgoing'
UPDATE medias SET source = 'outgoing' WHERE source IS NULL OR source = '';

-- Índice para filtrar por source rapidamente
ALTER TABLE medias ADD INDEX IF NOT EXISTS idx_source (source);
