import pool from './src/config/database';

async function finalCheck() {
    const conn = await pool.getConnection();
    try {
        const [countRow] = await conn.query('SELECT COUNT(*) as total FROM vm_lav_vouchers') as any[];
        console.log('Total de vouchers:', countRow.total || 0);

        const [logRow] = await conn.query("SELECT * FROM vm_lav_sincronizacoes_log WHERE tipo = 'vouchers' ORDER BY id DESC LIMIT 1") as any[];
        console.log('Ultimo log de vouchers:', JSON.stringify(logRow, null, 2));

        if (countRow.total > 0) {
            const [sample] = await conn.query('SELECT * FROM vm_lav_vouchers LIMIT 1') as any[];
            console.log('Amostra de voucher:', JSON.stringify(sample, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

finalCheck();
