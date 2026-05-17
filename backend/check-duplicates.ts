
import dotenv from 'dotenv';
dotenv.config();
const mariadb = require('mariadb');
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function checkDuplicates() {
    const conn = await pool.getConnection();
    try {
        console.log("Checking for clients with > 2 orders in the same second...");
        const query = `
            SELECT user_id, cliente_id, data_venda, COUNT(*) as qtd
            FROM vm_lav_pedidos
            GROUP BY user_id, cliente_id, data_venda
            HAVING qtd > 2
            ORDER BY qtd DESC
            LIMIT 20
        `;
        const rows = await conn.query(query);
        console.log(`Found ${rows.length} timestamps with > 2 orders:`);
        console.table(rows);
    } catch (e) {
        console.error(e);
    } finally {
        conn.release();
        process.exit(0);
    }
}
checkDuplicates();
