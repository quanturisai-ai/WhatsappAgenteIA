-- Adicionar campos para melhorar reconexão automática do WhatsApp
-- Estes campos permitem persistir informações necessárias para reconexão após reiniciar o servidor

ALTER TABLE whatsapp_sessions 
ADD COLUMN last_connected_at TIMESTAMP NULL COMMENT 'Última vez que a conexão foi estabelecida com sucesso',
ADD COLUMN last_ready_at TIMESTAMP NULL COMMENT 'Última vez que o evento ready foi disparado',
ADD COLUMN session_files_path VARCHAR(500) NULL COMMENT 'Caminho dos arquivos de sessão do LocalAuth',
ADD COLUMN session_files_hash VARCHAR(64) NULL COMMENT 'Hash dos arquivos críticos de sessão para verificar integridade';

-- Criar índices para melhorar performance nas consultas de reconexão
CREATE INDEX idx_last_connected_at ON whatsapp_sessions(last_connected_at);
CREATE INDEX idx_last_ready_at ON whatsapp_sessions(last_ready_at);
CREATE INDEX idx_session_files_path ON whatsapp_sessions(session_files_path);

