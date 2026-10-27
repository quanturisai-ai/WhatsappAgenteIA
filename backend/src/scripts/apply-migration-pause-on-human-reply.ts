/**
 * Aplica a migration add_pause_on_human_reply.sql de forma idempotente.
 * Uso: npx ts-node --transpile-only src/scripts/apply-migration-pause-on-human-reply.ts
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../config/database';
import logger from '../utils/logger';

async function main() {
  const conn = await pool.getConnection();
  try {
    const rows = (await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agent_config' AND COLUMN_NAME = 'pause_on_human_reply'`
    )) as any[];

    if (Array.isArray(rows) && rows.length > 0) {
      console.log('⏭️  agent_config.pause_on_human_reply já existe, pulando');
      return;
    }

    logger.info('Adicionando agent_config.pause_on_human_reply...');
    await conn.query(
      `ALTER TABLE agent_config
       ADD COLUMN pause_on_human_reply BOOLEAN NOT NULL DEFAULT TRUE
         COMMENT 'Pausar auto-resposta da IA quando um humano responde manualmente a conversa'`
    );
    console.log('✅ agent_config.pause_on_human_reply criada');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Erro ao aplicar migration:', err);
  process.exit(1);
});
