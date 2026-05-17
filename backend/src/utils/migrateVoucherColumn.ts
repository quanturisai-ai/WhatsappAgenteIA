import pool from '../config/database';

export async function migrateVoucherColumn(): Promise<void> {
    const conn = await pool.getConnection();
    try {
        console.log('Iniciando migração para adicionar coluna codigo_voucher...');

        // Verify if column already exists
        const rows = await conn.query("SHOW COLUMNS FROM premios_clientes LIKE 'codigo_voucher'") as any[];

        const rowsCount = Array.isArray(rows) ? rows.length : (rows && (rows as any).length) || 0;

        if (rowsCount > 0) {
            console.log('ℹ️ Coluna codigo_voucher já existe.');
            return;
        }

        console.log('Adicionando coluna codigo_voucher...');
        await conn.query('ALTER TABLE premios_clientes ADD COLUMN codigo_voucher VARCHAR(50) NULL COMMENT "Código do voucher gerado para o prêmio" AFTER observacao');
        console.log('✅ Coluna codigo_voucher adicionada com sucesso.');

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        throw error;
    } finally {
        conn.release();
    }
}
