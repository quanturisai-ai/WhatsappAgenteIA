/**
 * Diagnóstico: por que a query de fidelidade por movimentos não encontra pedidos?
 * Rode: npm run diagnose:fidelidade-movimentos 1
 *
 * Mostra: retiradas com serial, pedidos Voucher não marcados, e uma amostra
 * da query (com CPF normalizado) para user_id 1.
 */

import 'dotenv/config';
import pool from '../config/database';
import { normalizeCpfColumnSql } from '../utils/cpfUtils';

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const conn = await pool.getConnection();
  const cpfB = normalizeCpfColumnSql('b.cliente_cpf');
  const cpfC = normalizeCpfColumnSql('c.cliente_cpf');

  console.log('\n=== Diagnóstico: fidelidade por movimentos (user_id =', userId, ') ===\n');

  try {
    const [counts] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM vm_lav_vouchers_movimentos WHERE user_id = ? AND tipo_movimento = 'RETIRADA') AS retiradas_total,
         (SELECT COUNT(*) FROM vm_lav_vouchers_movimentos WHERE user_id = ? AND tipo_movimento = 'RETIRADA' AND equipamento_numero_serie IS NOT NULL AND TRIM(equipamento_numero_serie) != '') AS retiradas_com_serial,
         (SELECT COUNT(*) FROM vm_lav_pedidos WHERE user_id = ? AND tipo_pagamento = 'Voucher' AND (pago_com_fidelidade = 0 OR pago_com_fidelidade IS NULL)) AS pedidos_voucher_nao_marcados`,
      [userId, userId, userId]
    ) as any[];
    const c = Array.isArray(counts) ? counts[0] : counts;
    console.log('Retiradas (total):', (c as any)?.retiradas_total);
    console.log('Retiradas com equipamento_numero_serie preenchido:', (c as any)?.retiradas_com_serial);
    console.log('Pedidos tipo Voucher ainda não marcados (pago_com_fidelidade=0):', (c as any)?.pedidos_voucher_nao_marcados);

    const [amostraMov] = await conn.query(
      `SELECT a.id, a.id_voucher_vm, a.data_movimentacao, a.equipamento_numero_serie, b.cliente_cpf AS voucher_cpf
       FROM vm_lav_vouchers_movimentos a
       INNER JOIN vm_lav_vouchers b ON a.id_voucher_vm = b.id_voucher_vm AND b.user_id = a.user_id
       WHERE a.tipo_movimento = 'RETIRADA' AND a.user_id = ?
       LIMIT 5`,
      [userId]
    ) as any[];
    const amostraM = Array.isArray(amostraMov) ? amostraMov : [];
    console.log('\nAmostra movimentos (RETIRADA):');
    amostraM.forEach((r: any) => console.log('  ', r.data_movimentacao, 'serial', r.equipamento_numero_serie, 'voucher_cpf', r.voucher_cpf));

    const [amostraPed] = await conn.query(
      `SELECT id, data_venda, cliente_cpf, equipamento_numero_serie, tipo_pagamento, pago_com_fidelidade
       FROM vm_lav_pedidos WHERE user_id = ? AND tipo_pagamento = 'Voucher' AND (pago_com_fidelidade = 0 OR pago_com_fidelidade IS NULL)
       ORDER BY data_venda DESC LIMIT 5`,
      [userId]
    ) as any[];
    const amostraP = Array.isArray(amostraPed) ? amostraPed : [];
    console.log('\nAmostra pedidos (Voucher, não marcados):');
    amostraP.forEach((r: any) => console.log('  ', r.data_venda, 'cpf', r.cliente_cpf, 'serial', r.equipamento_numero_serie));

    const rows = await conn.query(
      `SELECT c.id, a.data_movimentacao, c.data_venda,
              ABS(TIMESTAMPDIFF(SECOND, a.data_movimentacao, c.data_venda)) AS diff_seg,
              DATE(a.data_movimentacao) AS data_mov, DATE(c.data_venda) AS data_ped
       FROM vm_lav_vouchers_movimentos a
       INNER JOIN vm_lav_vouchers b ON a.id_voucher_vm = b.id_voucher_vm AND b.user_id = a.user_id
       INNER JOIN vm_lav_pedidos c ON c.user_id = a.user_id
         AND ${cpfB} = ${cpfC}
         AND TRIM(COALESCE(c.equipamento_numero_serie, '')) = TRIM(COALESCE(a.equipamento_numero_serie, ''))
         AND DATE(a.data_movimentacao) = DATE(c.data_venda)
         AND c.tipo_pagamento = 'Voucher'
         AND (c.pago_com_fidelidade = 0 OR c.pago_com_fidelidade IS NULL)
       WHERE a.tipo_movimento = 'RETIRADA' AND a.user_id = ?`,
      [userId]
    ) as any[];
    const todos = Array.isArray(rows) ? rows : [];
    const dentroJanela = todos.filter((r: any) => (r.diff_seg ?? 999) <= 10);
    console.log('\nQuery (sem HAVING <= 10): linhas que batem CPF+equipamento+data:', todos.length);
    console.log('Dessas, com diff em segundos <= 10:', dentroJanela.length);
    if (todos.length > 0 && dentroJanela.length === 0) {
      console.log('Exemplo de diff_seg (por que passou de 10s):', todos.slice(0, 3).map((r: any) => r.diff_seg));
    }
  } finally {
    conn.release();
  }
  console.log('\n=== Fim diagnóstico ===\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
