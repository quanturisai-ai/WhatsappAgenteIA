import pool from './src/config/database';

async function checkData() {
    const conn = await pool.getConnection();
    try {
        console.log('--- Prêmios Pendentes ---');
        const [premios] = await conn.query(
            'SELECT id, cpf_cliente, codigo_voucher, utilizado FROM premios_clientes WHERE user_id = 1 AND codigo_voucher IS NOT NULL LIMIT 5'
        ) as any[];
        console.table(premios);

        console.log('--- Vouchers Sincronizados ---');
        const [vouchers] = await conn.query(
            'SELECT id, codigo, id_voucher_vm, saldo FROM vm_lav_vouchers WHERE user_id = 1 LIMIT 5'
        ) as any[];
        console.table(vouchers);
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkData();
