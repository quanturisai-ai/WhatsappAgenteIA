-- Migration: Criar tabela de reações
-- Data: 2025-11-11
-- Descrição: Tabela para armazenar reações (curtidas/emojis) em mensagens

-- Verificar se a tabela já existe antes de criar
SET @table_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reactions'
);

-- Criar tabela apenas se não existir
SET @sql = IF(@table_exists = 0,
    'CREATE TABLE IF NOT EXISTS reactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        reacted_message_id VARCHAR(100) NOT NULL COMMENT "ID da mensagem que foi reagida",
        reaction_emoji VARCHAR(10) NOT NULL COMMENT "Emoji da reação (👍, ❤️, etc.)",
        reacted_by VARCHAR(20) NOT NULL COMMENT "Número do contato que reagiu",
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        INDEX idx_message_id (message_id),
        INDEX idx_reacted_message_id (reacted_message_id),
        INDEX idx_reacted_by (reacted_by),
        INDEX idx_created_at (created_at),
        UNIQUE KEY unique_reaction (message_id, reacted_message_id, reacted_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    'SELECT "Tabela reactions já existe" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

