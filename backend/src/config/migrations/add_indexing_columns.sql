-- Migração: Adicionar colunas de rastreamento de indexação

-- Adicionar colunas na tabela agent_config
ALTER TABLE agent_config 
ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE agent_config 
ADD INDEX IF NOT EXISTS idx_indexing_status (indexing_status);

-- Adicionar colunas na tabela topics
ALTER TABLE topics 
ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE topics 
ADD INDEX IF NOT EXISTS idx_indexing_status (indexing_status);

-- Adicionar colunas na tabela documents
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE documents 
ADD INDEX IF NOT EXISTS idx_indexing_status (indexing_status);

-- Adicionar colunas na tabela medias
ALTER TABLE medias 
ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

ALTER TABLE medias 
ADD INDEX IF NOT EXISTS idx_indexing_status (indexing_status);

