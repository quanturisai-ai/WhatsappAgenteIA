
import dotenv from 'dotenv';

dotenv.config();

const mariadb = require('mariadb');
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function investigateNotifications() {
    const cpf = '011.909.721-40';
    const dateFilter = '2026-02-16'; // Filter for relevant orders/notifications

    console.log(`--- Investigating Notifications for CPF: ${cpf} on ${dateFilter} ---`);

    const conn = await pool.getConnection();
    try {
        // 1. Get User ID
        const clienteRows = await conn.query("SELECT id, user_id, nome FROM vm_lav_clientes WHERE cpf = ?", [cpf]);
        if (clienteRows.length === 0) {
            console.error("Cliente not found");
            return;
        }
        const cliente = clienteRows[0];
        console.log(`Cliente found: ID=${cliente.id}, UserID=${cliente.user_id}, Nome=${cliente.nome}`);
        const userId = cliente.user_id;

        // 2. Fetch Orders (ALL)
        const queryPedidos = `
            SELECT id, data_venda, tipo_servico, valor, situacao_venda, created_at, pago_com_fidelidade
            FROM vm_lav_pedidos 
            WHERE user_id = ? AND cliente_id = ?
            ORDER BY data_venda DESC
            LIMIT 20
        `;
        const pedidos = await conn.query(queryPedidos, [userId, cliente.id]);

        // 3. Fetch Notifications (created today)
        const queryNotif = `
            SELECT id, tipo_notificacao, data_venda, created_at, enviado_whatsapp, erro, pedido_id, mensagem_enviada
            FROM fidelizacao_notificacoes 
            WHERE user_id = ? AND cpf_cliente = ?
            AND DATE(created_at) = ?
            ORDER BY created_at ASC
        `;
        const notificacoes = await conn.query(queryNotif, [userId, cpf, dateFilter]);

        console.log("\n--- ORDERS JSON ---");
        console.log(JSON.stringify(pedidos, null, 2));

        console.log("\n--- NOTIFICATIONS JSON ---");
        console.log(JSON.stringify(notificacoes, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        conn.release();
        process.exit(0);
    }
}

investigateNotifications();
