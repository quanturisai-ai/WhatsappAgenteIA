import pool from '../config/database';
import logger from '../utils/logger';

export async function up() {
    const conn = await pool.getConnection();
    try {
        logger.info('Adicionando coluna pago_com_fidelidade à tabela vm_lav_pedidos...');
        await conn.query(`
            ALTER TABLE vm_lav_pedidos 
            ADD COLUMN IF NOT EXISTS pago_com_fidelidade TINYINT(1) DEFAULT 0 AFTER cliente_id;
        `);
        logger.info('Coluna pago_com_fidelidade adicionada com sucesso.');
    } catch (error: any) {
        logger.error('Erro ao adicionar coluna pago_com_fidelidade: ' + error.message);
        throw error;
    } finally {
        conn.release();
    }
}
