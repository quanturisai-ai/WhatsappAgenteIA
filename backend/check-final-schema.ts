import pool from './src/config/database';

async function check() {
    const conn = await pool.getConnection();
    try {
        const rows = await conn.query("SHOW COLUMNS FROM vm_lav_vouchers") as any[];
        const columns = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0] : rows) : [];

        for (const col of columns) {
            console.log(`${col.Field}: ${col.Type}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

check();
