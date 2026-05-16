-- Migration: Renomear coluna senha_criptografada para senha (remover criptografia)
-- Data: 2025-01-XX

-- Verificar se a coluna senha_criptografada existe e renomear para senha
-- Se a coluna senha já existe, não fazer nada

SET @col_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'vm_lav_credentials' 
    AND COLUMN_NAME = 'senha_criptografada'
);

SET @col_senha_exists = (
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'vm_lav_credentials' 
    AND COLUMN_NAME = 'senha'
);

-- Se senha_criptografada existe e senha não existe, renomear
SET @sql = IF(
  @col_exists > 0 AND @col_senha_exists = 0,
  'ALTER TABLE vm_lav_credentials CHANGE COLUMN senha_criptografada senha TEXT NOT NULL COMMENT ''Senha em texto plano''',
  'SELECT ''Coluna já renomeada ou não existe'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

