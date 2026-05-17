
const mariadb = require('mariadb');
const dotenv = require('dotenv');
const fs = require('fs');

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
    let output = '';
    try {
        conn = await pool.getConnection();
        const cpf = '510.046.821-15';
        const cpfClean = '51004682115';

        output += `Searching for CPF: ${cpf} or ${cpfClean}\n`;

        // 1. Find Client
        const clients = await conn.query(
            "SELECT * FROM vm_lav_clientes WHERE cpf = ? OR cpf = ? OR cpf LIKE ?",
            [cpf, cpfClean, `%${cpfClean}%`]
        );

        output += '\n--- Client Info ---\n';
        output += JSON.stringify(clients, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';

        if (clients.length === 0) {
            output += 'Client not found.\n';
            fs.writeFileSync('diagnosis_output_v2.json', output, 'utf8');
            return;
        }

        const client = clients[0];
        const clientId = client.id;
        const userId = client.user_id;
        const clientCpf = client.cpf;

        output += `Client ID: ${clientId}, User ID: ${userId}, CPF in DB: ${clientCpf}\n`;

        // 2. Find Purchases (vm_lav_pedidos)
        const purchases = await conn.query(
            "SELECT * FROM vm_lav_pedidos WHERE cliente_id = ? AND user_id = ? ORDER BY data_venda ASC",
            [clientId, userId]
        );

        output += '\n--- Purchase History (by ID) ---\n';
        output += JSON.stringify(purchases, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';

        // 3. Find Notifications (fidelizacao_notificacoes)
        const notifications = await conn.query(
            "SELECT * FROM fidelizacao_notificacoes WHERE cpf_cliente = ? AND user_id = ? ORDER BY created_at ASC",
            [clientCpf, userId]
        );

        output += '\n--- Notification History ---\n';
        output += JSON.stringify(notifications, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n';

        fs.writeFileSync('diagnosis_output_v2.json', output, 'utf8');
        console.log('Diagnosis saved to diagnosis_output_v2.json');

    } catch (err) {
        console.error(err);
    } finally {
        if (conn) conn.release();
        pool.end();
    }
}

investigate();
