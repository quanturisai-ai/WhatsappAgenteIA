
const mariadb = require('mariadb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function investigate() {
    const pool = mariadb.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'agente_zap',
    });

    let conn;
    try {
        conn = await pool.getConnection();
        const cpf = '510.046.821-15';
        const cpfClean = '51004682115';

        console.log(`Searching for CPF: ${cpf} or ${cpfClean}`);

        // 1. Find Client
        const clients = await conn.query(
            "SELECT * FROM vm_lav_clientes WHERE cpf = ? OR cpf = ? OR cpf LIKE ?",
            [cpf, cpfClean, `%${cpfClean}%`]
        );

        console.log('\n--- Client Info ---');
        console.log(JSON.stringify(clients, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

        if (clients.length === 0) {
            console.log('Client not found.');
            return;
        }

        const client = clients[0];
        const clientId = client.id;
        const userId = client.user_id;
        const clientCpf = client.cpf;

        console.log(`Client ID: ${clientId}, User ID: ${userId}, CPF in DB: ${clientCpf}`);

        // 2. Find Purchases (vm_lav_pedidos)
        const purchases = await conn.query(
            "SELECT * FROM vm_lav_pedidos WHERE cliente_id = ? AND user_id = ? ORDER BY data_venda ASC",
            [clientId, userId]
        );

        console.log('\n--- Purchase History (by ID) ---');
        console.log(JSON.stringify(purchases, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

        // Also check by CPF just in case
        const purchasesByCpf = await conn.query(
            "SELECT * FROM vm_lav_pedidos WHERE cliente_cpf = ? AND user_id = ? ORDER BY data_venda ASC",
            [clientCpf, userId]
        );
        console.log('\n--- Purchase History (by CPF) ---');
        console.log(JSON.stringify(purchasesByCpf, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

        // 3. Find Notifications (fidelizacao_notificacoes)
        const notifications = await conn.query(
            "SELECT * FROM fidelizacao_notificacoes WHERE cpf_cliente = ? AND user_id = ? ORDER BY created_at ASC",
            [clientCpf, userId]
        );

        console.log('\n--- Notification History ---');
        console.log(JSON.stringify(notifications, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.release();
        pool.end();
    }
}

investigate();
