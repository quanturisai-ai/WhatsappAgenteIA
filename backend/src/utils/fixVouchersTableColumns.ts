import pool from '../config/database';
import logger from './logger';

async function fixVouchersTableColumns(): Promise<void> {
    const conn = await pool.getConnection();
    try {
        logger.info('Aumentando tamanho das colunas na tabela vm_lav_vouchers...');

        await conn.query(`
            ALTER TABLE vm_lav_vouchers 
            MODIFY COLUMN categoria_nome VARCHAR(255) NULL,
            MODIFY COLUMN responsavel VARCHAR(500) NULL,
            MODIFY COLUMN cliente_nome TEXT NULL
        `);

        logger.info('✅ Colunas da tabela vm_lav_vouchers atualizadas com sucesso.');
    } catch (err: any) {
        logger.error('Erro ao atualizar colunas da tabela vm_lav_vouchers: ' + err.message);
        throw err;
    } finally {
        conn.release();
    }
}

export default fixVouchersTableColumns;
