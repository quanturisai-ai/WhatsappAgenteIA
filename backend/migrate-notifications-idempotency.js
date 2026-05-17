const mariadb = require('mariadb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function migrate() {
    const pool = mariadb.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: 5
    });

    let conn;
    try {
        conn = await pool.getConnection();
        console.log('--- Iniciando Migração: Proteção contra Duplicidade ---');

        // 1. Adicionar coluna data_venda
        console.log('1. Adicionando coluna data_venda...');
        try {
            await conn.query(`
        ALTER TABLE fidelizacao_notificacoes 
        ADD COLUMN data_venda DATETIME NULL AFTER pedido_id
      `);
            console.log('Coluna data_venda adicionada.');
        } catch (e) {
            if (e.errno === 1060) {
                console.log('Coluna data_venda já existe.');
            } else {
                throw e;
            }
        }

        // 2. Popular data_venda com base em pedido_id (Para registros antigos)
        console.log('2. Populando data_venda a partir da tabela de pedidos...');
        const result = await conn.query(`
      UPDATE fidelizacao_notificacoes fn
      JOIN vm_lav_pedidos p ON fn.pedido_id = p.id
      SET fn.data_venda = p.data_venda
      WHERE fn.data_venda IS NULL AND fn.pedido_id IS NOT NULL
    `);
        console.log(`Registros atualizados: ${result.affectedRows}`);

        // Para notificações sem pedido_id (se houver), usar data_envio como fallback para não quebrar o índice futuro
        await conn.query(`
      UPDATE fidelizacao_notificacoes 
      SET data_venda = data_envio 
      WHERE data_venda IS NULL
    `);

        // 3. Limpar duplicatas REAIS antes de criar o índice único (Prevenção de erro na criação do index)
        // Se já existem registros com o mesmo (user_id, cpf_cliente, data_venda, tipo_notificacao), 
        // precisamos manter apenas o mais antigo ou o que foi enviado com sucesso.
        console.log('3. Removendo duplicatas existentes para permitir criação do índice único...');
        await conn.query(`
      DELETE t1 FROM fidelizacao_notificacoes t1
      INNER JOIN fidelizacao_notificacoes t2 
      WHERE t1.id > t2.id 
      AND t1.user_id = t2.user_id 
      AND t1.cpf_cliente = t2.cpf_cliente 
      AND t1.data_venda = t2.data_venda 
      AND t1.tipo_notificacao = t2.tipo_notificacao
    `);

        // 4. Criar o Índice Único
        console.log('4. Criando índice único (Trava Anti-Duplicidade)...');
        try {
            await conn.query(`
        ALTER TABLE fidelizacao_notificacoes 
        ADD UNIQUE INDEX idx_notificacao_idempotencia 
        (user_id, cpf_cliente, data_venda, tipo_notificacao)
      `);
            console.log('Índice único criado com sucesso.');
        } catch (e) {
            if (e.errno === 1061) {
                console.log('Índice único já existe.');
            } else {
                throw e;
            }
        }

        console.log('--- Migração concluída com sucesso! ---');

    } catch (error) {
        console.error('ERRO NA MIGRAÇÃO:', error);
    } finally {
        if (conn) conn.release();
        await pool.end();
    }
}

migrate();
