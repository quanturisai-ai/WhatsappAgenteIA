
import dotenv from 'dotenv';
dotenv.config();
const mariadb = require('mariadb');
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function analyze() {
    const conn = await pool.getConnection();
    const userId = 1; // Assuming user 1
    try {
        console.log("--- Analysis of Notification Strategy ---\n");

        // 1. Check Data Quality in Notifications
        const notifStats = await conn.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(data_venda) as with_data,
                MIN(data_venda) as min_date,
                MAX(data_venda) as max_date
            FROM fidelizacao_notificacoes
            WHERE user_id = ? AND tipo_notificacao = 'PROGRESSO'
        `, [userId]);
        console.log("Current Progress Notifications:", notifStats[0]);

        // 2. Simulate Grouping (Moments)
        const moments = await conn.query(`
            SELECT cliente_id, cliente_cpf, data_venda, COUNT(*) as qtd
            FROM vm_lav_pedidos
            WHERE user_id = ?
            GROUP BY cliente_cpf, data_venda
            HAVING qtd > 1
            LIMIT 5
        `, [userId]);
        console.log("\nSample Moments with > 1 Order (Duplicates):");
        console.table(moments);

        // 3. Watermark Risk Analysis
        // Find if there are any *unprocessed* orders that are OLDER than the latest processed order.
        // This would indicate that a simple "MAX DATE" watermark would skip them.

        // First, get the latest notification date
        const lastNotif = await conn.query(`
            SELECT MAX(data_venda) as last_processed
            FROM fidelizacao_notificacoes
            WHERE user_id = ? AND tipo_notificacao = 'PROGRESSO'
        `, [userId]);
        const watermark = lastNotif[0].last_processed;
        console.log(`\nProposed Watermark (Max Data Venda Processed): ${watermark}`);

        if (watermark) {
            const skippedOrders = await conn.query(`
                SELECT count(*) as count
                FROM vm_lav_pedidos p
                WHERE p.user_id = ? 
                AND p.data_venda < ? 
                AND p.situacao_venda = 'Sucesso'
                AND NOT EXISTS (
                    SELECT 1 FROM fidelizacao_notificacoes n 
                    WHERE n.user_id = p.user_id 
                    AND n.cpf_cliente = p.cliente_cpf 
                    AND n.data_venda = p.data_venda
                    AND n.tipo_notificacao = 'PROGRESSO'
                )
                ORDER BY p.data_venda DESC
            `, [userId, watermark]);

            console.log(`\nRISK ASSESSMENT:`);
            console.log(`Orders older than watermark that have NOT been notified: ${skippedOrders[0].count}`);
            if (skippedOrders[0].count > 0) {
                console.log("⚠️  WARNING: The watermark strategy implies ignoring these older, un-notified orders.");
                console.log("    If these are just legacy orders from before the system started, it's fine.");
                console.log("    But if these are recent syncs that arrived out-of-order, they would be missed.");
            } else {
                console.log("✅ SAFE: No un-notified orders found older than the watermark.");
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        conn.release();
        process.exit(0);
    }
}
analyze();
