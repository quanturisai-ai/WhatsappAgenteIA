import pool from './src/config/database';

async function checkDetails() {
    const conn = await pool.getConnection();
    try {
        console.log('--- Credentials ---');
        const [creds] = await conn.query('SELECT * FROM vm_lav_credentials') as any[];
        console.table(creds);

        console.log('\n--- Voucher Sync Logs ---');
        const [logs] = await conn.query("SELECT * FROM vm_lav_sincronizacoes_log WHERE tipo = 'vouchers' ORDER BY data_execucao DESC LIMIT 10") as any[];
        console.table(logs);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkDetails();
