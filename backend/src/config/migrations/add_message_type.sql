-- Migration: Adicionar campo message_type na tabela messages
-- Data: 2025-11-11
-- Descrição: Adiciona campo para identificar tipo de mensagem (text, media, reaction, system, etc.)

-- Verificar se a coluna já existe antes de adicionar
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'messages'
    AND COLUMN_NAME = 'message_type'
);

-- Adicionar coluna apenas se não existir
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE messages ADD COLUMN message_type ENUM(\'text\', \'media\', \'reaction\', \'system\', \'location\', \'contact\', \'other\') DEFAULT \'text\' AFTER content',
    'SELECT "Coluna message_type já existe" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Atualizar mensagens existentes sem conteúdo para tipo 'reaction' ou 'system'
UPDATE messages 
SET message_type = 'reaction' 
WHERE (content IS NULL OR content = '' OR TRIM(content) = '')
AND message_type = 'text';

