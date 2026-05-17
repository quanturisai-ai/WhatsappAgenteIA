const mariadb = require('mariadb');
const dotenv = require('dotenv');

dotenv.config();

async function checkOrder() {
    const pool = mariadb.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: 1
    });

    let conn;
    try {
        conn = await pool.getConnection();
        const cpf = '703.557.531-62';
        const dataVenda = '2026-02-16 17:15:57';

        console.log(`Buscando pedido: CPF ${cpf}, Data ${dataVenda}...`);

        const rows = await conn.query(
            'SELECT id, valor, situacao_venda, tipo_pagamento, servico, pago_com_fidelidade, data_venda FROM vm_lav_pedidos WHERE cliente_cpf = ? AND data_venda = ?',
            [cpf, dataVenda]
        );

        if (rows.length === 0) {
            console.log('Nenhum pedido encontrado exatamente com esse CPF e data.');
        } else {
            console.log('Pedido encontrado:');
            console.log(JSON.stringify(rows[0], null, 2));
        }

        // Verificar se existe voucher utilizado por este cliente hoje
        console.log('\nVerificando vouchers do cliente...');
        const vouchers = await conn.query(
            'SELECT pc.*, p.descricao FROM premios_clientes pc JOIN premios p ON pc.premio_id = p.id WHERE pc.cpf_cliente = ? ORDER BY pc.created_at DESC LIMIT 5',
            [cpf]
        );
        console.table(vouchers.map(v => ({
            id: v.id,
            premio: v.descricao,
            conquista: v.data_conquista,
            utilizado: v.utilizado,
            data_util: v.data_utilizacao
        })));

    } catch (error) {
        console.error('Erro:', error);
    } finally {
        if (conn) conn.release();
        await pool.end();
    }
}

checkOrder();
