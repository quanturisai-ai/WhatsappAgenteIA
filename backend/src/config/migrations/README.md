# Migrations do Banco de Dados

## Como Executar Migrations

### Migration: add_message_type.sql

Esta migration adiciona o campo `message_type` na tabela `messages` para identificar o tipo de mensagem (text, media, reaction, system, etc.).

#### Opção 1: Executar via MySQL/MariaDB CLI

```bash
mysql -u seu_usuario -p nome_do_banco < backend/src/config/migrations/add_message_type.sql
```

#### Opção 2: Executar via cliente MySQL (phpMyAdmin, MySQL Workbench, etc.)

1. Abra o arquivo `backend/src/config/migrations/add_message_type.sql`
2. Copie o conteúdo
3. Execute no cliente MySQL/MariaDB

#### Opção 3: Executar via Node.js (se houver script de migration)

```bash
cd backend
node scripts/run-migration.js add_message_type.sql
```

## Verificação

Após executar a migration, verifique se a coluna foi adicionada:

```sql
DESCRIBE messages;
```

Você deve ver a coluna `message_type` com tipo `ENUM` e valor padrão `'text'`.

## Rollback (se necessário)

Se precisar reverter a migration:

```sql
ALTER TABLE messages DROP COLUMN message_type;
```

