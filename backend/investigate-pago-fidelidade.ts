/**
 * Script temporário: investigar por que 7256/7257 não foram marcados e 7286 foi marcado indevidamente.
 * NÃO altera nada no banco.
 */
import dotenv from 'dotenv';
import mariadb from 'mariadb';

dotenv.config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'agente_zap',
  connectionLimit: 2,
});

function normalizeCpfToDigits(cpf: string | null): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('=== PEDIDOS 7256, 7257, 7286 (vm_lav_pedidos) ===\n');
    const resPedidos = await conn.query(
      `SELECT id, user_id, cliente_cpf, equipamento_numero_serie, valor, valor_sem_desconto, data_venda, tipo_pagamento, pago_com_fidelidade, situacao_venda
       FROM vm_lav_pedidos WHERE id IN (7256, 7257, 7286) ORDER BY id`
    ) as any;
    let pedidos: any[] = Array.isArray(resPedidos) ? (Array.isArray(resPedidos[0]) ? resPedidos[0] : resPedidos) : [resPedidos];
    if (!Array.isArray(pedidos)) pedidos = [pedidos];
    console.log(JSON.stringify(pedidos, null, 2));

    console.log('\n=== VOUCHER HF66YLY4 (vm_lav_vouchers) ===\n');
    const resVouchers = await conn.query(
      `SELECT id, user_id, id_voucher_vm, codigo, categoria_nome, cliente_cpf, cliente_nome, saldo
       FROM vm_lav_vouchers WHERE codigo = 'HF66YLY4'`
    ) as any;
    const vouchers = Array.isArray(resVouchers) ? (Array.isArray(resVouchers[0]) ? resVouchers[0] : resVouchers) : [resVouchers];
    const vArr = Array.isArray(vouchers) ? vouchers : [vouchers];
    console.log(JSON.stringify(vArr, null, 2));

    console.log('\n=== CPF normalizado (dígitos) dos pedidos e do voucher ===');
    const pArr = Array.isArray(pedidos) ? pedidos : [pedidos];
    for (const p of pArr) {
      const norm = normalizeCpfToDigits(p.cliente_cpf);
      console.log(`Pedido ${p.id} cliente_cpf="${p.cliente_cpf}" => dígitos="${norm}"`);
    }
    for (const v of vArr) {
      const norm = normalizeCpfToDigits(v.cliente_cpf);
      console.log(`Voucher ${v.codigo} cliente_cpf="${v.cliente_cpf}" => dígitos="${norm}"`);
    }

    console.log('\n=== Outros pedidos mesmo user_id, mesma data (7286) para ver possível match errado ===');
    const p7286 = pArr.find((p: any) => p.id === 7286);
    if (p7286) {
      const resOutros = await conn.query(
        `SELECT id, cliente_cpf, equipamento_numero_serie, valor, valor_sem_desconto, data_venda, tipo_pagamento, pago_com_fidelidade
         FROM vm_lav_pedidos
         WHERE user_id = ? AND id != 7286
           AND ABS(TIMESTAMPDIFF(MINUTE, data_venda, ?)) <= 10
         ORDER BY data_venda`,
        [p7286.user_id, p7286.data_venda]
      ) as any;
      const outros = Array.isArray(resOutros) ? (Array.isArray(resOutros[0]) ? resOutros[0] : resOutros) : [resOutros];
      console.log(JSON.stringify(outros, null, 2));
    }

    console.log('\n=== Todos os vouchers Fidelidade/Cortesia com cliente_cpf (para ver qual poderia bater em 7286) ===');
    const resTodosV = await conn.query(
      `SELECT id, codigo, cliente_cpf, id_voucher_vm FROM vm_lav_vouchers
       WHERE user_id = 1 AND categoria_nome IN ('Fidelidade', 'Cortesia')
       ORDER BY codigo LIMIT 30`
    ) as any;
    const todosVouchers = Array.isArray(resTodosV) ? (Array.isArray(resTodosV[0]) ? resTodosV[0] : resTodosV) : [resTodosV];
    console.log(JSON.stringify(todosVouchers, null, 2));

    console.log('\n=== Pedidos 7256/7257: intervalo de data_venda (para comparar com retiradas) ===');
    const resP7256 = await conn.query(
      `SELECT id, data_venda, UNIX_TIMESTAMP(data_venda) as ts FROM vm_lav_pedidos WHERE id IN (7256, 7257)`
    ) as any;
    const p7256 = Array.isArray(resP7256) ? (Array.isArray(resP7256[0]) ? resP7256[0] : resP7256) : [resP7256];
    console.log(JSON.stringify(p7256, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));

    console.log('\n=== SIMULAÇÃO: quais pedidos bateriam no 1º UPDATE (valor=0) para CPF 703 e máquina B827EB144A16? ===');
    const [r1] = await conn.query(
      `SELECT id, valor, data_venda, tipo_pagamento, pago_com_fidelidade FROM vm_lav_pedidos
       WHERE user_id = 1 AND REPLACE(REPLACE(REPLACE(cliente_cpf,'.',''),'-',''),' ','') = '70355753162'
         AND equipamento_numero_serie = 'B827EB144A16' AND valor = 0 AND pago_com_fidelidade = 0`
    ) as any;
    console.log('Pedidos com valor=0:', r1);

    console.log('\n=== SIMULAÇÃO: pedidos 7286 e 7287 - ambos na mesma janela de 5 min? ===');
    const [r2] = await conn.query(
      `SELECT id, cliente_cpf, data_venda, tipo_pagamento, pago_com_fidelidade,
              ABS(TIMESTAMPDIFF(MINUTE, data_venda, '2026-02-22 20:12:00')) as diff_min
       FROM vm_lav_pedidos WHERE id IN (7286, 7287)`
    ) as any;
    console.log(JSON.stringify(r2, (_, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
