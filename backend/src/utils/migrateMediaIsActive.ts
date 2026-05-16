import pool from '../config/database';
import logger from './logger';

/**
 * Migração para adicionar campo is_active na tabela medias
 */
export async function migrateMediaIsActive(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Verificando campo is_active na tabela medias...');

    // Verificar se a coluna já existe
    try {
      const [columns] = await conn.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'medias' 
         AND COLUMN_NAME = 'is_active'`
      ) as any[];

      let exists = false;
      if (Array.isArray(columns)) {
        exists = columns.length > 0;
      } else if (columns && typeof columns === 'object') {
        exists = (columns.rows && columns.rows.length > 0) || 
                (columns.COLUMN_NAME || columns.column_name);
      }

      if (!exists) {
        logger.info('Adicionando coluna is_active...');
        await conn.query(
          `ALTER TABLE medias 
           ADD COLUMN is_active BOOLEAN DEFAULT TRUE`
        );
        logger.info('✅ Coluna is_active adicionada');
        
        // Adicionar índice
        try {
          await conn.query(
            `CREATE INDEX idx_is_active ON medias (is_active)`
          );
          logger.info('✅ Índice idx_is_active criado');
        } catch (error: any) {
          if (error.message?.includes('Duplicate key') || error.code === 1061) {
            logger.info('Índice idx_is_active já existe');
          } else {
            logger.warn(`Erro ao criar índice: ${error.message}`);
          }
        }
      } else {
        logger.info('Coluna is_active já existe');
      }
    } catch (error: any) {
      // Se o erro for de coluna duplicada, apenas logar
      if (error.message?.includes('Duplicate column') || error.code === 1060) {
        logger.info('Coluna is_active já existe');
      } else {
        logger.warn(`Erro ao verificar/adicionar is_active: ${error.message}`);
      }
    }

    logger.info('✅ Migração de is_active para medias concluída');
  } catch (error: any) {
    logger.error(`Erro na migração de is_active para medias: ${error.message}`);
    // Não lançar erro se for apenas coluna duplicada
    if (!error.message?.includes('Duplicate column') && error.code !== 1060) {
      throw error;
    }
  } finally {
    conn.release();
  }
}

