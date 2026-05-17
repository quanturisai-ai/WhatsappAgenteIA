import pool from './src/config/database';

async function reproduce() {
    const conn = await pool.getConnection();
    try {
        // Record based on the debug-fetch-vouchers output
        // [ "15/02/2026", "6XY4WN9B", { "nome": "Fidelidade" }, true, "15/02/2026 00:00:00 ~ 31/03/2026 00:00:00", "R$ 16,95", "R$ 16,95", "Lavateria Park Lozandes", 249210, "70355753162 - Lara Roberta Santos", { "idVoucher": 220782, "ativo": true } ]

        const userId = 1;
        const idVoucherVm = 220782;
        const codigo = "6XY4WN9B";
        const categoriaId = 10;
        const categoriaNome = "Fidelidade";
        const dataGerado = new Date("2026-02-15T00:00:00");
        const validadeInicio = new Date("2026-02-15T00:00:00");
        const validadeFim = new Date("2026-03-31T00:00:00");
        const valor = 16.95;
        const saldo = 16.95;
        const responsavel = "Lavateria Park Lozandes";
        const carteira = 249210;
        const clienteCpf = "70355753162";
        const clienteNome = "Lara Roberta Santos";
        const ativo = 1;

        console.log('Tentando insert...');
        await conn.query(`
      INSERT INTO vm_lav_vouchers 
      (user_id, id_voucher_vm, codigo, categoria_id, categoria_nome, data_gerado, 
       validade_inicio, validade_fim, valor, saldo, responsavel, carteira, 
       cliente_cpf, cliente_nome, ativo) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [userId, idVoucherVm, codigo, categoriaId, categoriaNome, dataGerado,
            validadeInicio, validadeFim, valor, saldo, responsavel, carteira,
            clienteCpf, clienteNome, ativo]);

        console.log('SUCESSO!');
    } catch (err: any) {
        console.error('FALHA:', err.message);
        if (err.sql) console.log('SQL:', err.sql);
        if (err.parameters) console.log('PARAMS:', err.parameters);
    } finally {
        conn.release();
        process.exit(0);
    }
}

reproduce();
