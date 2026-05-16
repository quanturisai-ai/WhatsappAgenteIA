-- Script para verificar a estrutura da tabela reactions
-- Execute este script para verificar se a migration foi aplicada corretamente

-- Verificar estrutura da coluna message_id
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reactions'
  AND COLUMN_NAME = 'message_id';

-- Verificar se existe coluna reacted_message_id (deve não existir após migration)
SELECT 
    COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reactions'
  AND COLUMN_NAME = 'reacted_message_id';

-- Verificar foreign keys
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'reactions'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- Verificar se existe mensagem com o message_id específico
SELECT 
    id,
    message_id,
    content,
    created_at
FROM messages
WHERE message_id = 'true_556181935443@c.us_3EB00E0AAA8910AC4A4E16'
LIMIT 1;

