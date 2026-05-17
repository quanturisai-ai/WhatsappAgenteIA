import pool from './src/config/database';

async function checkLogs() {
    const conn = await pool.getConnection();
    try {
        console.log('--- Ultimos logs de sincronização ---');
        const [rows] = await conn.query('SELECT * FROM vm_lav_sincronizacoes_log ORDER BY data_execucao DESC LIMIT 10') as any[];
        console.table(rows);

        console.log('\n--- Contagem de vouchers na tabela ---');
        const [voucherCount] = await conn.query('SELECT COUNT(*) as total FROM vm_lav_vouchers') as any[];
        console.table(voucherCount);

        console.log('\n--- Amostra de vouchers (se houver) ---');
        const [vouchers] = await conn.query('SELECT * FROM vm_lav_vouchers LIMIT 5') as any[];
        console.table(vouchers);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkLogs();
