import pool from '../config/database';
import logger from './logger';

export async function migrateIndexingColumns(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Iniciando migração: adicionando colunas de indexação...');

    // Verificar e adicionar colunas na tabela agent_config
    try {
      // Verificar se a coluna já existe antes de adicionar
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'agent_config' 
        AND COLUMN_NAME = 'last_indexed_at'
      `) as any[];

      if (!columns || columns.length === 0) {
        await conn.query(`
          ALTER TABLE agent_config 
          ADD COLUMN last_indexed_at TIMESTAMP NULL,
          ADD COLUMN indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
          ADD COLUMN content_hash VARCHAR(64)
        `);
        logger.info('Colunas adicionadas em agent_config');
      } else {
        logger.debug('Colunas de indexação já existem em agent_config');
      }
    } catch (error: any) {
      logger.warn(`Erro ao adicionar colunas em agent_config: ${error.message}`);
    }

    // Adicionar índice se não existir
    try {
      const [indexes] = await conn.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'agent_config' 
        AND INDEX_NAME = 'idx_indexing_status'
      `) as any[];

      if (!indexes || indexes.length === 0) {
        await conn.query(`
          CREATE INDEX idx_indexing_status ON agent_config (indexing_status)
        `);
        logger.info('Índice criado em agent_config');
      }
    } catch (error: any) {
      logger.warn(`Erro ao criar índice em agent_config: ${error.message}`);
    }

    // Verificar e adicionar colunas na tabela topics
    try {
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'topics' 
        AND COLUMN_NAME = 'last_indexed_at'
      `) as any[];

      if (!columns || columns.length === 0) {
        await conn.query(`
          ALTER TABLE topics 
          ADD COLUMN last_indexed_at TIMESTAMP NULL,
          ADD COLUMN indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
          ADD COLUMN content_hash VARCHAR(64)
        `);
        logger.info('Colunas adicionadas em topics');
      } else {
        logger.debug('Colunas de indexação já existem em topics');
      }
    } catch (error: any) {
      logger.warn(`Erro ao adicionar colunas em topics: ${error.message}`);
    }

    try {
      const [indexes] = await conn.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'topics' 
        AND INDEX_NAME = 'idx_indexing_status'
      `) as any[];

      if (!indexes || indexes.length === 0) {
        await conn.query(`
          CREATE INDEX idx_indexing_status ON topics (indexing_status)
        `);
        logger.info('Índice criado em topics');
      }
    } catch (error: any) {
      logger.warn(`Erro ao criar índice em topics: ${error.message}`);
    }

    // Verificar e adicionar colunas na tabela documents
    try {
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'documents' 
        AND COLUMN_NAME = 'last_indexed_at'
      `) as any[];

      if (!columns || columns.length === 0) {
        await conn.query(`
          ALTER TABLE documents 
          ADD COLUMN last_indexed_at TIMESTAMP NULL,
          ADD COLUMN indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
          ADD COLUMN content_hash VARCHAR(64)
        `);
        logger.info('Colunas adicionadas em documents');
      } else {
        logger.debug('Colunas de indexação já existem em documents');
      }
    } catch (error: any) {
      logger.warn(`Erro ao adicionar colunas em documents: ${error.message}`);
    }

    try {
      const [indexes] = await conn.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'documents' 
        AND INDEX_NAME = 'idx_indexing_status'
      `) as any[];

      if (!indexes || indexes.length === 0) {
        await conn.query(`
          CREATE INDEX idx_indexing_status ON documents (indexing_status)
        `);
        logger.info('Índice criado em documents');
      }
    } catch (error: any) {
      logger.warn(`Erro ao criar índice em documents: ${error.message}`);
    }

    // Verificar e adicionar colunas na tabela medias
    try {
      const [columns] = await conn.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'medias' 
        AND COLUMN_NAME = 'last_indexed_at'
      `) as any[];

      if (!columns || columns.length === 0) {
        await conn.query(`
          ALTER TABLE medias 
          ADD COLUMN last_indexed_at TIMESTAMP NULL,
          ADD COLUMN indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
          ADD COLUMN content_hash VARCHAR(64)
        `);
        logger.info('Colunas adicionadas em medias');
      } else {
        logger.debug('Colunas de indexação já existem em medias');
      }
    } catch (error: any) {
      logger.warn(`Erro ao adicionar colunas em medias: ${error.message}`);
    }

    try {
      const [indexes] = await conn.query(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'medias' 
        AND INDEX_NAME = 'idx_indexing_status'
      `) as any[];

      if (!indexes || indexes.length === 0) {
        await conn.query(`
          CREATE INDEX idx_indexing_status ON medias (indexing_status)
        `);
        logger.info('Índice criado em medias');
      }
    } catch (error: any) {
      logger.warn(`Erro ao criar índice em medias: ${error.message}`);
    }

    logger.info('Migração de colunas de indexação concluída');
  } catch (error: any) {
    logger.error(`Erro na migração: ${error.message}`);
    throw error;
  } finally {
    conn.release();
  }
}

