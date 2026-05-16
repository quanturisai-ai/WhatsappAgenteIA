-- Migration: Adicionar colunas para timestamps de recebimento e leitura de mensagens
-- Data: 2025-11-12
-- Descrição:
--   Adiciona colunas received_at e read_at na tabela messages para rastrear
--   quando uma mensagem foi recebida (ack=1) e quando foi lida (ack=2)

ALTER TABLE messages
ADD COLUMN received_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Data/hora em que a mensagem foi recebida (ack=1)' AFTER created_at,
ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Data/hora em que a mensagem foi lida (ack=2)' AFTER received_at;

-- Adicionar índices para melhorar performance de consultas
CREATE INDEX idx_received_at ON messages (received_at);
CREATE INDEX idx_read_at ON messages (read_at);

