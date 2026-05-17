/**
 * Script temporário: simula a lógica de marcar pedidos como pago com fidelidade
 * (API + saldo) e executa todas as verificações, incluindo chamadas à API de movimentações.
 *
 * Uso: npm run diagnose:fidelidade [userId]
 * Ex.: npm run diagnose:fidelidade 1
 *      (a partir da pasta backend)
 *
 * Não altera nenhum dado; apenas consulta DB e API e imprime o diagnóstico.
 */

import 'dotenv/config';
import pool from '../config/database';
import { normalizeCpfToDigits, normalizeCpfColumnSql } from '../utils/cpfUtils';
import { VmLavService } from '../services/vmLav.service';

const TOL = 0.02;
const JANELA_MIN = 15;

function parseNum(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(',', '.').trim()) || 0;
}

function toArray(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return Array.isArray(rows[0]) ? (rows as any[])[0] : rows;
  return [rows];
}

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const vmLavService = new VmLavService();
  const conn = await pool.getConnection();
  const cpfCol = normalizeCpfColumnSql('cliente_cpf');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO: Marcação de pedidos como pago com fidelidade');
  console.log('  user_id =', userId);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    // ─── 1. Valores reais em vm_lav_vouchers (sem filtro de categoria) ───
    console.log('─── 1. VM_LAV_VOUCHERS (todos os vouchers do user) ───\n');
    const [rawVouchers] = await conn.query(
      `SELECT id, codigo, categoria_nome, valor, saldo, cliente_cpf FROM vm_lav_vouchers WHERE user_id = ?`,
      [userId]
    ) as any;
    const allVouchers = toArray(rawVouchers);
    if (allVouchers.length === 0) {
      console.log('   Nenhum voucher encontrado para user_id =', userId);
    } else {
      console.log('   Total:', allVouchers.length, 'voucher(s)');
      const categorias = [...new Set(allVouchers.map((v: any) => v.categoria_nome).filter(Boolean))];
      console.log('   Categorias distintas em categoria_nome:', categorias.length ? categorias.join(', ') : '(todas null)');
      allVouchers.slice(0, 15).forEach((v: any) => {
        console.log('   ', v.codigo, '| categoria_nome:', JSON.stringify(v.categoria_nome), '| valor:', v.valor, '| saldo:', v.saldo, '| saldo<valor:', parseNum(v.saldo) < parseNum(v.valor), '| cpf:', v.cliente_cpf);
      });
      if (allVouchers.length > 15) console.log('   ... e mais', allVouchers.length - 15);
    }

    // ─── 2. Teto: filtro exato do código (Fidelidade/Cortesia, saldo < valor) ───
    console.log('\n─── 2. TETO (filtro: categoria_nome IN (\'Fidelidade\', \'Cortesia\') AND saldo < valor) ───\n');
    const [rowsV] = await conn.query(
      `SELECT user_id, cliente_cpf, valor, saldo FROM vm_lav_vouchers
       WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia') AND saldo < valor`,
      [userId]
    ) as any;
    const vouchersTeto = toArray(rowsV);
    const tetoPorCpf = new Map<string, number>();
    for (const v of vouchersTeto) {
      const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
      if (!cpfNorm) continue;
      const consumo = parseNum(v.valor) - parseNum(v.saldo);
      if (consumo <= 0) continue;
      tetoPorCpf.set(cpfNorm, (tetoPorCpf.get(cpfNorm) || 0) + consumo);
    }
    console.log('   Vouchers que passam no filtro:', vouchersTeto.length);
    if (tetoPorCpf.size === 0) {
      console.log('   Teto por CPF: (vazio) → NENHUM pedido será marcado sem teto.');
    } else {
      console.log('   Teto por CPF:');
      tetoPorCpf.forEach((teto, cpf) => console.log('      CPF', cpf, '→ teto', teto.toFixed(2)));
    }

    // ─── 3. Token ───
    console.log('\n─── 3. TOKEN (obterTokenValido) ───\n');
    const token = await vmLavService.obterTokenValido(userId);
    if (!token) {
      console.log('   Token: (nulo) → API de movimentações não será chamada.');
    } else {
      console.log('   Token: obtido (', token.substring(0, 20) + '... )');
    }

    // ─── 4. Vouchers usados para buscar retiradas (mesmo filtro Fidelidade/Cortesia) ───
    console.log('\n─── 4. VOUCHERS PARA API (categoria_nome IN (\'Fidelidade\', \'Cortesia\')) ───\n');
    const [rowsVouchersApi] = await conn.query(
      `SELECT id_voucher_vm, codigo, cliente_cpf, categoria_nome FROM vm_lav_vouchers WHERE user_id = ? AND categoria_nome IN ('Fidelidade', 'Cortesia')`,
      [userId]
    ) as any;
    const vouchersApi = toArray(rowsVouchersApi);
    console.log('   Vouchers com categoria Fidelidade/Cortesia:', vouchersApi.length);
    vouchersApi.slice(0, 10).forEach((v: any) => console.log('      id_vm:', v.id_voucher_vm, 'codigo:', v.codigo, 'cpf:', v.cliente_cpf));

    // ─── 5. Chamadas à API de movimentações e retiradas ───
    console.log('\n─── 5. RETIRADAS DA API (buscarMovimentacoesVoucher por voucher) ───\n');
    const retiradas: { valorRetirada: number; dataRetirada: Date; serialMaquina: string; cpfNorm: string; codigo: string }[] = [];
    if (token && vouchersApi.length > 0) {
      for (const v of vouchersApi) {
        const movResult = await vmLavService.buscarMovimentacoesVoucher(token, v.id_voucher_vm);
        const cpfNorm = normalizeCpfToDigits(v.cliente_cpf);
        if (!cpfNorm) continue;
        if (!movResult.success) {
          console.log('   Voucher', v.codigo, '(id_vm', v.id_voucher_vm, '): API falhou:', movResult.error || 'unknown');
          continue;
        }
        const elementos = movResult.elementos || [];
        const lista = (elementos as any[]).filter((m: any) => m.tipoMovimento === 'RETIRADA');
        console.log('   Voucher', v.codigo, ': elementos', elementos.length, ', RETIRADAS', lista.length);
        for (const r of lista) {
          const dataStr = r.dataMovimentacao?.endsWith('Z') ? r.dataMovimentacao : (r.dataMovimentacao || '') + 'Z';
          const dataRetirada = new Date(dataStr);
          const valorRetirada = Math.abs(parseFloat(r.valor) || 0);
          const maquinaProp = r.transacaoConta?.propriedades?.find((p: any) =>
            p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
          );
          let serial = maquinaProp?.propriedade?.numeroSerie || maquinaProp?.propriedade?.descricao;
          if (serial) serial = String(serial).trim();
          if (!serial) {
            console.log('      Retirada sem serial da máquina ignorada:', dataRetirada.toISOString(), 'valor', valorRetirada);
            continue;
          }
          retiradas.push({ valorRetirada, dataRetirada, serialMaquina: serial, cpfNorm, codigo: v.codigo });
          console.log('      Retirada:', dataRetirada.toISOString(), 'valor', valorRetirada, 'serial', serial, 'cpf', cpfNorm);
        }
      }
    } else {
      console.log('   Nenhuma chamada à API (sem token ou sem vouchers Fidelidade/Cortesia).');
    }
    console.log('   Total de retiradas consideradas:', retiradas.length);

    // ─── 6. Pedidos na base (amostra e tipos) ───
    console.log('\n─── 6. PEDIDOS (vm_lav_pedidos) ───\n');
    const [rowsTipos] = await conn.query(
      `SELECT tipo_pagamento, COUNT(*) as cnt FROM vm_lav_pedidos WHERE user_id = ? GROUP BY tipo_pagamento`,
      [userId]
    ) as any;
    const tipos = toArray(rowsTipos);
    console.log('   Contagem por tipo_pagamento:');
    tipos.forEach((t: any) => console.log('     ', t.tipo_pagamento, '→', t.cnt));
    const [rowsPedidos] = await conn.query(
      `SELECT id, cliente_cpf, data_venda, valor, valor_sem_desconto, tipo_pagamento, equipamento_numero_serie, pago_com_fidelidade
       FROM vm_lav_pedidos WHERE user_id = ? ORDER BY data_venda DESC LIMIT 20`,
      [userId]
    ) as any;
    const pedidosAmostra = toArray(rowsPedidos);
    console.log('   Amostra (últimos 20 por data_venda):');
    pedidosAmostra.forEach((p: any) => {
      console.log('      id', p.id, 'cpf', p.cliente_cpf, 'data_venda', p.data_venda, 'tipo', p.tipo_pagamento, 'valor_sem_desconto', p.valor_sem_desconto, 'serial', JSON.stringify(p.equipamento_numero_serie), 'pago_fid', p.pago_com_fidelidade);
    });

    // ─── 7. Casamento retirada ↔ pedido (mesma lógica do service) ───
    console.log('\n─── 7. CASAMENTO RETIRADA → PEDIDO (por retirada) ───\n');
    const matchedIds = new Set<number>();
    const pedidosPorCpfFromApi = new Map<string, { id: number; valor_sem_desconto: number; data_venda: Date }[]>();
    for (const ret of retiradas) {
      const [rowsC] = await conn.query(
        `SELECT id, valor_sem_desconto, data_venda, valor FROM vm_lav_pedidos
         WHERE user_id = ? AND ${cpfCol} = ? AND tipo_pagamento = 'Voucher' AND pago_com_fidelidade = 0
           AND equipamento_numero_serie = ?
           AND ABS(TIMESTAMPDIFF(MINUTE, data_venda, ?)) <= ?
         ORDER BY data_venda ASC`,
        [userId, ret.cpfNorm, ret.serialMaquina, ret.dataRetirada, JANELA_MIN]
      ) as any;
      const candidatos = toArray(rowsC);
      const disponiveis = candidatos.filter((p: any) => !matchedIds.has(p.id));
      console.log('   Retirada', ret.dataRetirada.toISOString(), 'valor', ret.valorRetirada, 'serial', ret.serialMaquina, 'cpf', ret.cpfNorm);
      console.log('      Candidatos (CPF+serial+janela 15min+Voucher+pago_fid=0):', candidatos.length, ', já usados excluídos:', disponiveis.length);

      let escolhidos: { id: number; valor_sem_desconto: number; data_venda: Date }[] = [];
      const v = ret.valorRetirada;
      const v1 = disponiveis.find((p: any) => Math.abs(parseNum(p.valor_sem_desconto) - v) <= TOL || (parseNum(p.valor) === 0 && parseNum(p.valor_sem_desconto) > 0));
      if (v1) {
        escolhidos = [{ id: v1.id, valor_sem_desconto: parseNum(v1.valor_sem_desconto), data_venda: v1.data_venda }];
        console.log('      Match 1 pedido (valor ou valor=0): id', v1.id);
      } else if (disponiveis.length >= 2) {
        const metade = v / 2;
        const dois = disponiveis.filter((p: any) => Math.abs(parseNum(p.valor_sem_desconto) - metade) <= TOL);
        if (dois.length >= 2) {
          escolhidos = [
            { id: dois[0].id, valor_sem_desconto: parseNum(dois[0].valor_sem_desconto), data_venda: dois[0].data_venda },
            { id: dois[1].id, valor_sem_desconto: parseNum(dois[1].valor_sem_desconto), data_venda: dois[1].data_venda },
          ];
          console.log('      Match 2 pedidos (metade): id', dois[0].id, dois[1].id);
        } else if (dois.length === 1) {
          const outro = disponiveis.find((p: any) => p.id !== dois[0].id && Math.abs(parseNum(p.valor_sem_desconto) + parseNum(dois[0].valor_sem_desconto) - v) <= TOL);
          if (outro) {
            escolhidos = [
              { id: dois[0].id, valor_sem_desconto: parseNum(dois[0].valor_sem_desconto), data_venda: dois[0].data_venda },
              { id: outro.id, valor_sem_desconto: parseNum(outro.valor_sem_desconto), data_venda: outro.data_venda },
            ];
            console.log('      Match 2 pedidos (soma): id', dois[0].id, outro.id);
          }
        }
      }
      if (escolhidos.length === 0) console.log('      Nenhum match.');
      for (const p of escolhidos) {
        matchedIds.add(p.id);
        const arr = pedidosPorCpfFromApi.get(ret.cpfNorm) || [];
        arr.push(p);
        pedidosPorCpfFromApi.set(ret.cpfNorm, arr);
      }
    }

    // ─── 8. Aplicação do teto (quais seriam marcados) ───
    console.log('\n─── 8. APLICAÇÃO DO TETO (pedidos que seriam marcados pela API) ───\n');
    const idsParaMarcar = new Set<number>();
    for (const [cpfNorm, lista] of pedidosPorCpfFromApi) {
      const teto = tetoPorCpf.get(cpfNorm) ?? 0;
      const ordenados = [...lista].sort((a, b) => new Date(a.data_venda).getTime() - new Date(b.data_venda).getTime());
      let running = 0;
      for (const p of ordenados) {
        if (running + p.valor_sem_desconto <= teto + TOL) {
          idsParaMarcar.add(p.id);
          running += p.valor_sem_desconto;
        }
      }
    }
    console.log('   IDs que seriam marcados (via API + teto):', idsParaMarcar.size, idsParaMarcar.size ? [...idsParaMarcar] : '');

    // ─── 9. Fallback por saldo ───
    console.log('\n─── 9. FALLBACK POR SALDO (consumo restante) ───\n');
    for (const [cpfNorm, teto] of tetoPorCpf) {
      if (teto <= 0) continue;
      const [resRows] = await conn.query(
        `SELECT COALESCE(SUM(valor_sem_desconto), 0) as s FROM vm_lav_pedidos WHERE user_id = ? AND ${cpfCol} = ? AND pago_com_fidelidade = 1`,
        [userId, cpfNorm]
      ) as any;
      const sumRows = toArray(resRows);
      const firstRow = (sumRows[0] ?? null) as { s?: number } | undefined;
      const jaMarcado = parseNum(firstRow?.s ?? 0);
      const resto = teto - jaMarcado;
      console.log('   CPF', cpfNorm, 'teto', teto.toFixed(2), 'já_marcado', jaMarcado.toFixed(2), 'resto', resto.toFixed(2));
      if (resto <= TOL) {
        console.log('      Resto <= tolerância → nada a marcar no fallback.');
        continue;
      }
      const [rowsP] = await conn.query(
        `SELECT id, valor_sem_desconto, data_venda FROM vm_lav_pedidos
         WHERE user_id = ? AND ${cpfCol} = ? AND tipo_pagamento = 'Voucher' AND pago_com_fidelidade = 0
         ORDER BY data_venda ASC`,
        [userId, cpfNorm]
      ) as any;
      const pedidos = toArray(rowsP);
      console.log('      Pedidos elegíveis (Voucher, pago_fid=0) no fallback:', pedidos.length);
      let runningFb = jaMarcado;
      let fallbackCount = 0;
      for (const p of pedidos) {
        const valorPed = parseNum(p.valor_sem_desconto);
        if (runningFb + valorPed <= teto + TOL) {
          console.log('         Fallback marcaria id', p.id, 'valor_sem_desconto', valorPed);
          runningFb += valorPed;
          fallbackCount++;
        }
      }
      if (fallbackCount === 0 && pedidos.length > 0) console.log('         (nenhum marcado: soma já no teto ou fora da tolerância)');
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  FIM DO DIAGNÓSTICO (nenhum dado foi alterado)');
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } finally {
    conn.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
