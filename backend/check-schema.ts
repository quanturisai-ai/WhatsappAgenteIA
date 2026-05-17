import pool from './src/config/database';

async function checkSchema() {
    const conn = await pool.getConnection();
    try {
        const [cols] = await conn.query('SHOW COLUMNS FROM vm_lav_vouchers') as any[];
        console.table(cols);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkSchema();
