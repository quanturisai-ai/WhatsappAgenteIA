-- Migração: Adicionar status 'connection_failed' ao ENUM da tabela whatsapp_sessions
-- Data: 2025-12-28
-- Descrição: Adiciona o status 'connection_failed' ao ENUM para suportar falhas técnicas de conexão

-- Verificar se a coluna existe e adicionar o novo valor ao ENUM
-- No MariaDB/MySQL, precisamos redefinir o ENUM completo com todos os valores
ALTER TABLE whatsapp_sessions 
MODIFY COLUMN status ENUM('disconnected', 'connecting', 'connected', 'authenticated', 'connection_failed') 
DEFAULT 'disconnected';

-- Verificar se a alteração foi aplicada
SELECT COLUMN_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'whatsapp_sessions' 
  AND COLUMN_NAME = 'status';

