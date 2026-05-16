import pool from '../config/database';
import logger from './logger';

/**
 * Migração para adicionar campos de modelo (embedding_model e generation_model) na tabela agent_config
 */
export async function migrateModelColumns(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Verificando colunas de modelo na tabela agent_config...');

    // Verificar embedding_model
    try {
      const [embeddingColumns] = await conn.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'agent_config' 
         AND COLUMN_NAME = 'embedding_model'`
      ) as any[];

      let embeddingExists = false;
      if (Array.isArray(embeddingColumns)) {
        embeddingExists = embeddingColumns.length > 0;
      } else if (embeddingColumns && typeof embeddingColumns === 'object') {
        embeddingExists = (embeddingColumns.rows && embeddingColumns.rows.length > 0) || 
                          (embeddingColumns.COLUMN_NAME || embeddingColumns.column_name);
      }

      if (!embeddingExists) {
        logger.info('Adicionando coluna embedding_model...');
        await conn.query(
          `ALTER TABLE agent_config 
           ADD COLUMN embedding_model VARCHAR(100) DEFAULT 'deepseek-r1'`
        );
        logger.info('✅ Coluna embedding_model adicionada');
      } else {
        logger.info('Coluna embedding_model já existe');
      }
    } catch (error: any) {
      // Se o erro for de coluna duplicada, apenas logar
      if (error.message?.includes('Duplicate column') || error.code === 1060) {
        logger.info('Coluna embedding_model já existe');
      } else {
        logger.warn(`Erro ao verificar/adicionar embedding_model: ${error.message}`);
      }
    }

    // Verificar generation_model
    try {
      const [generationColumns] = await conn.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'agent_config' 
         AND COLUMN_NAME = 'generation_model'`
      ) as any[];

      let generationExists = false;
      if (Array.isArray(generationColumns)) {
        generationExists = generationColumns.length > 0;
      } else if (generationColumns && typeof generationColumns === 'object') {
        generationExists = (generationColumns.rows && generationColumns.rows.length > 0) || 
                          (generationColumns.COLUMN_NAME || generationColumns.column_name);
      }

      if (!generationExists) {
        logger.info('Adicionando coluna generation_model...');
        await conn.query(
          `ALTER TABLE agent_config 
           ADD COLUMN generation_model VARCHAR(100) DEFAULT 'deepseek-r1'`
        );
        logger.info('✅ Coluna generation_model adicionada');
      } else {
        logger.info('Coluna generation_model já existe');
      }
    } catch (error: any) {
      // Se o erro for de coluna duplicada, apenas logar
      if (error.message?.includes('Duplicate column') || error.code === 1060) {
        logger.info('Coluna generation_model já existe');
      } else {
        logger.warn(`Erro ao verificar/adicionar generation_model: ${error.message}`);
      }
    }

    logger.info('✅ Migração de colunas de modelo concluída');
  } catch (error: any) {
    logger.error(`Erro na migração de colunas de modelo: ${error.message}`);
    // Não lançar erro se for apenas coluna duplicada
    if (!error.message?.includes('Duplicate column') && error.code !== 1060) {
      throw error;
    }
  } finally {
    conn.release();
  }
}

