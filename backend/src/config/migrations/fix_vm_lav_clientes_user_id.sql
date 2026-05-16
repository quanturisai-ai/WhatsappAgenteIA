-- Migration: Adicionar coluna user_id na tabela vm_lav_clientes se não existir
-- Data: 2025-11-14

-- Verificar e adicionar coluna user_id se não existir
ALTER TABLE vm_lav_clientes 
ADD COLUMN IF NOT EXISTS user_id INT NOT NULL COMMENT 'ID do usuário que possui estes clientes' AFTER id;

-- Adicionar foreign key se não existir
-- Nota: MariaDB não suporta IF NOT EXISTS para foreign keys, então vamos usar um procedimento
SET @dbname = DATABASE();
SET @tablename = 'vm_lav_clientes';
SET @columnname = 'user_id';
SET @fkname = 'fk_vm_lav_clientes_user_id';

-- Verificar se a foreign key já existe
SET @fk_exists = (
  SELECT COUNT(*) 
  FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = @dbname 
    AND TABLE_NAME = @tablename 
    AND CONSTRAINT_NAME = @fkname
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

-- Adicionar foreign key apenas se não existir
SET @sql = IF(@fk_exists = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname, ' FOREIGN KEY (', @columnname, ') REFERENCES users(id) ON DELETE CASCADE'),
  'SELECT "Foreign key already exists" as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adicionar índice se não existir
CREATE INDEX IF NOT EXISTS idx_user_id ON vm_lav_clientes(user_id);

-- Adicionar unique constraint se não existir
-- Nota: MariaDB não suporta IF NOT EXISTS para unique constraints diretamente
SET @unique_exists = (
  SELECT COUNT(*) 
  FROM information_schema.TABLE_CONSTRAINTS 
  WHERE CONSTRAINT_SCHEMA = @dbname 
    AND TABLE_NAME = @tablename 
    AND CONSTRAINT_NAME = 'unique_user_vm_cliente'
    AND CONSTRAINT_TYPE = 'UNIQUE'
);

SET @sql_unique = IF(@unique_exists = 0,
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT unique_user_vm_cliente UNIQUE (', @columnname, ', id_cliente_vm)'),
  'SELECT "Unique constraint already exists" as message'
);

PREPARE stmt_unique FROM @sql_unique;
EXECUTE stmt_unique;
DEALLOCATE PREPARE stmt_unique;

