-- Migration: Adicionar campo media_id na tabela messages
-- Data: 2025-11-15
-- Descrição: Adiciona campo para relacionar mensagens de mídia com a tabela medias

-- Verificar se a coluna já existe antes de adicionar
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND COLUMN_NAME = 'media_id'
);

-- Adicionar coluna apenas se não existir
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE messages ADD COLUMN media_id INT NULL AFTER message_type',
    'SELECT "Coluna media_id já existe" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adicionar índice se não existir
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND INDEX_NAME = 'idx_media_id'
);

SET @sql_idx = IF(@idx_exists = 0,
    'CREATE INDEX idx_media_id ON messages(media_id)',
    'SELECT "Índice idx_media_id já existe" AS message'
);

PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- Adicionar foreign key se não existir
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND CONSTRAINT_NAME = 'fk_messages_media_id'
);

SET @sql_fk = IF(@fk_exists = 0,
    'ALTER TABLE messages ADD CONSTRAINT fk_messages_media_id FOREIGN KEY (media_id) REFERENCES medias(id) ON DELETE SET NULL',
    'SELECT "Foreign key fk_messages_media_id já existe" AS message'
);

PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

