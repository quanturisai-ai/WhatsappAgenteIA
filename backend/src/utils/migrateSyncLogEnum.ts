import pool from '../config/database';
import logger from './logger';

async function migrateSyncLogEnum(): Promise<void> {
    const conn = await pool.getConnection();
    try {
        logger.info('Atualizando ENUM tipo em vm_lav_sincronizacoes_log...');

        // MariaDB/MySQL ALTER TABLE MODIFY COLUMN to update ENUM
        await conn.query(`
      ALTER TABLE vm_lav_sincronizacoes_log 
      MODIFY COLUMN tipo ENUM('clientes', 'pedidos', 'vouchers', 'ambos') NOT NULL
    `);

        logger.info('✅ ENUM tipo atualizado com sucesso.');
    } catch (err: any) {
        logger.error('Erro ao atualizar ENUM tipo: ' + err.message);
        throw err;
    } finally {
        conn.release();
    }
}

export default migrateSyncLogEnum;
