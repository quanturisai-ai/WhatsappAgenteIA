/**
 * Aplica a migration add_conversation_classification.sql de forma idempotente
 * (verifica se cada coluna já existe via information_schema antes de alterar —
 * mesmo padrão usado em src/utils/migrateVmLavTables.ts).
 *
 * Uso: npx ts-node --transpile-only src/scripts/apply-migration-classificacao.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../config/database';
import logger from '../utils/logger';

async function columnExists(
  conn: any,
  table: string,
  column: string
): Promise<boolean> {
  const rows = (await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )) as any[];
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    logger.info('Aplicando migration: add_conversation_classification.sql');

    if (!(await columnExists(conn, 'messages', 'source'))) {
      logger.info('Adicionando messages.source...');
      await conn.query(
        `ALTER TABLE messages
         ADD COLUMN source ENUM('client', 'ai', 'human', 'automation') NULL
           COMMENT 'Origem da mensagem. NULL = legado, classificado retroativamente pelo backfill.',
         ADD INDEX idx_source (source)`
      );
      console.log('  ✅ messages.source criada');
    } else {
      console.log('  ⏭️  messages.source já existe, pulando');
    }

    if (!(await columnExists(conn, 'conversations', 'handler'))) {
      logger.info('Adicionando conversations.handler...');
      await conn.query(
        `ALTER TABLE conversations
         ADD COLUMN handler ENUM('none', 'ai', 'human') NOT NULL DEFAULT 'none'
           COMMENT 'Quem está atendendo a conversa agora',
         ADD INDEX idx_handler (handler)`
      );
      console.log('  ✅ conversations.handler criada');
    } else {
      console.log('  ⏭️  conversations.handler já existe, pulando');
    }

    if (!(await columnExists(conn, 'conversations', 'origin'))) {
      logger.info('Adicionando conversations.origin...');
      await conn.query(
        `ALTER TABLE conversations
         ADD COLUMN origin ENUM('inbound', 'campaign', 'outbound') NOT NULL DEFAULT 'inbound'
           COMMENT 'Como a conversa nasceu: orgânica, campanha/fidelização ou contato ativo da empresa'`
      );
      console.log('  ✅ conversations.origin criada');
    } else {
      console.log('  ⏭️  conversations.origin já existe, pulando');
    }

    if (!(await columnExists(conn, 'conversations', 'last_client_message_at'))) {
      logger.info('Adicionando conversations.last_client_message_at...');
      await conn.query(
        `ALTER TABLE conversations
         ADD COLUMN last_client_message_at TIMESTAMP NULL
           COMMENT 'Última mensagem recebida do cliente (direction=incoming) — base da auto-finalização',
         ADD INDEX idx_last_client_message_at (last_client_message_at)`
      );
      console.log('  ✅ conversations.last_client_message_at criada');
    } else {
      console.log('  ⏭️  conversations.last_client_message_at já existe, pulando');
    }

    console.log('\n✅ Migration aplicada (ou já estava aplicada).');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erro ao aplicar migration:', err);
  process.exit(1);
});
