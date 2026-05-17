const pool = require('./backend/src/config/database').default;

async function migrate() {
    const conn = await pool.getConnection();
    try {
        console.log('Iniciando migração de unicidade para vm_lav_pedidos...');

        // 1. Identificar e remover duplicatas antes de criar o índice único
        console.log('Limpando duplicatas existentes...');
        await conn.query(`
      DELETE t1 FROM vm_lav_pedidos t1
      INNER JOIN vm_lav_pedidos t2 
      WHERE t1.id < t2.id 
      AND t1.user_id = t2.user_id 
      AND t1.data_venda = t2.data_venda 
      AND (t1.id_maquina = t2.id_maquina OR (t1.id_maquina IS NULL AND t2.id_maquina IS NULL))
      AND (t1.cliente_cpf = t2.cliente_cpf OR (t1.cliente_cpf IS NULL AND t2.cliente_cpf IS NULL))
    `);

        // 2. Adicionar o índice único
        console.log('Adicionando índice único...');
        try {
            await conn.query('ALTER TABLE vm_lav_pedidos ADD CONSTRAINT unique_user_pedido_lav UNIQUE (user_id, data_venda, id_maquina, cliente_cpf)');
            console.log('✅ Índice único adicionado com sucesso.');
        } catch (err) {
            if (err.message.includes('Duplicate key name') || err.code === 'ER_DUP_KEYNAME') {
                console.log('ℹ️ Índice único já existe.');
            } else {
                throw err;
            }
        }

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
