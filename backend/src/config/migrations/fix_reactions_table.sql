-- Migration: Corrigir estrutura da tabela reactions
-- Data: 2025-11-12
-- Descrição: 
--   1. Alterar message_id para VARCHAR(100) e relacionar com message_id da tabela messages
--   2. Remover coluna reacted_message_id (redundante)

-- Verificar se a tabela existe
SET @table_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reactions'
);

-- Executar alterações apenas se a tabela existir
SET @sql = IF(@table_exists > 0,
    CONCAT(
        -- 1. Remover constraint e índices antigos
        'ALTER TABLE reactions DROP FOREIGN KEY reactions_ibfk_1; ',
        'ALTER TABLE reactions DROP INDEX idx_message_id; ',
        'ALTER TABLE reactions DROP INDEX idx_reacted_message_id; ',
        'ALTER TABLE reactions DROP INDEX unique_reaction; ',
        
        -- 2. Remover coluna reacted_message_id
        'ALTER TABLE reactions DROP COLUMN reacted_message_id; ',
        
        -- 3. Alterar message_id para VARCHAR(100)
        'ALTER TABLE reactions MODIFY COLUMN message_id VARCHAR(100) NOT NULL COMMENT "ID da mensagem que foi reagida (message_id da tabela messages)"; ',
        
        -- 4. Adicionar foreign key relacionando com message_id da tabela messages
        'ALTER TABLE reactions ADD CONSTRAINT fk_reactions_message_id FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE; ',
        
        -- 5. Recriar índices
        'ALTER TABLE reactions ADD INDEX idx_message_id (message_id); ',
        'ALTER TABLE reactions ADD INDEX idx_reacted_by (reacted_by); ',
        'ALTER TABLE reactions ADD INDEX idx_created_at (created_at); ',
        
        -- 6. Recriar constraint única (message_id, reacted_by)
        'ALTER TABLE reactions ADD UNIQUE KEY unique_reaction (message_id, reacted_by); '
    ),
    'SELECT "Tabela reactions não existe" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

