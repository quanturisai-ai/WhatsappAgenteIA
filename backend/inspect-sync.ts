import pool from './src/config/database';

async function inspect() {
    const conn = await pool.getConnection();
    try {
        console.log('--- Columns in vm_lav_credentials ---');
        const [cols] = await conn.query('SHOW COLUMNS FROM vm_lav_credentials') as any[];
        console.table(cols);

        console.log('\n--- Credentials Content (Sample) ---');
        const [creds] = await conn.query('SELECT user_id, email, status, ativo FROM vm_lav_credentials') as any[];
        console.table(creds);

        console.log('\n--- All Sync Logs (Last 20) ---');
        const [logs] = await conn.query('SELECT * FROM vm_lav_sincronizacoes_log ORDER BY data_execucao DESC LIMIT 20') as any[];
        console.table(logs);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

inspect();
