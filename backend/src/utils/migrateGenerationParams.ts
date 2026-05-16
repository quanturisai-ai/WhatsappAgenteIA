import pool from '../config/database';
import logger from './logger';

/**
 * Migração para adicionar parâmetros de geração do Ollama na tabela agent_config
 * 
 * Parâmetros:
 * - temperature: Controla criatividade (0.0 = preciso, 2.0 = criativo) - padrão: 0.7
 * - top_p: Nucleus sampling (0.0-1.0) - padrão: 0.9
 * - top_k: Limita tokens considerados (1-100) - padrão: 40
 * - repeat_penalty: Penaliza repetições (0.0-2.0) - padrão: 1.1
 */
export async function migrateGenerationParams(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    logger.info('Verificando parâmetros de geração na tabela agent_config...');

    const params = [
      { name: 'temperature', type: 'DECIMAL(3,2)', default: '0.7', description: 'Criatividade (0.0=preciso, 2.0=criativo)' },
      { name: 'top_p', type: 'DECIMAL(3,2)', default: '0.9', description: 'Nucleus sampling (0.0-1.0)' },
      { name: 'top_k', type: 'INT', default: '40', description: 'Limita tokens considerados (1-100)' },
      { name: 'repeat_penalty', type: 'DECIMAL(3,2)', default: '1.1', description: 'Penaliza repetições (0.0-2.0)' },
    ];

    for (const param of params) {
      try {
        const [columns] = await conn.query(
          `SELECT COLUMN_NAME 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'agent_config' 
           AND COLUMN_NAME = ?`,
          [param.name]
        ) as any[];

        let exists = false;
        if (Array.isArray(columns)) {
          exists = columns.length > 0;
        } else if (columns && typeof columns === 'object') {
          exists = (columns.rows && columns.rows.length > 0) || 
                  (columns.COLUMN_NAME || columns.column_name);
        }

        if (!exists) {
          logger.info(`Adicionando coluna ${param.name}...`);
          await conn.query(
            `ALTER TABLE agent_config 
             ADD COLUMN ${param.name} ${param.type} DEFAULT ${param.default}`
          );
          logger.info(`✅ Coluna ${param.name} adicionada (${param.description})`);
        } else {
          logger.info(`Coluna ${param.name} já existe`);
        }
      } catch (error: any) {
        // Se o erro for de coluna duplicada, apenas logar
        if (error.message?.includes('Duplicate column') || error.code === 1060) {
          logger.info(`Coluna ${param.name} já existe`);
        } else {
          logger.warn(`Erro ao verificar/adicionar ${param.name}: ${error.message}`);
        }
      }
    }

    logger.info('✅ Migração de parâmetros de geração concluída');
  } catch (error: any) {
    logger.error(`Erro na migração de parâmetros de geração: ${error.message}`);
    // Não lançar erro se for apenas coluna duplicada
    if (!error.message?.includes('Duplicate column') && error.code !== 1060) {
      throw error;
    }
  } finally {
    conn.release();
  }
}

