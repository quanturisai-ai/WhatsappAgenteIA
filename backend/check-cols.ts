import pool from './src/config/database';

async function checkSpecificCols() {
    const conn = await pool.getConnection();
    try {
        const [rows] = await conn.query("SHOW COLUMNS FROM vm_lav_vouchers") as any[];
        for (const col of rows) {
            console.log(`${col.Field}: ${col.Type}`);
        }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkSpecificCols();
