import pool from './src/config/database';

async function verify() {
    const conn = await pool.getConnection();
    try {
        console.log('--- vm_lav_vouchers ---');
        const [rows] = await conn.query('DESCRIBE vm_lav_vouchers') as any[];
        console.table(rows);

        console.log('--- vm_lav_sincronizacoes_log (tipo) ---');
        const [logRows] = await conn.query("SHOW COLUMNS FROM vm_lav_sincronizacoes_log LIKE 'tipo'") as any[];
        console.table(logRows);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

verify();
