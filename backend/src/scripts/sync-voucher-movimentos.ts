/**
 * Script temporário: para cada voucher (Fidelidade/Cortesia, saldo < valor, com CPF, data_gerado >= 2026-01-01),
 * chama a API de movimentações e grava os registros na tabela vm_lav_vouchers_movimentos.
 *
 * Pré-requisito: executar o SQL add_vm_lav_vouchers_movimentos.sql para criar a tabela.
 *
 * Uso: npm run sync:voucher-movimentos [userId]
 * Ex.: npm run sync:voucher-movimentos 1
 */

import 'dotenv/config';
import pool from '../config/database';
import { VmLavService } from '../services/vmLav.service';

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const vmLavService = new VmLavService();
  const conn = await pool.getConnection();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Sync: API de movimentações → vm_lav_vouchers_movimentos');
  console.log('  user_id =', userId);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    const token = await vmLavService.obterTokenValido(userId);
    if (!token) {
      console.error('Token inválido. Não foi possível obter token para o usuário.', userId);
      process.exit(1);
    }
    console.log('Token obtido.\n');

    // MariaDB driver: conn.query(SELECT) retorna o array de linhas diretamente (não [rows, meta])
    const rows = await conn.query(
      `SELECT id, user_id, id_voucher_vm, codigo, cliente_cpf, categoria_nome
       FROM vm_lav_vouchers
       WHERE CAST(REPLACE(REPLACE(COALESCE(saldo, '0'), ',', '.'), ' ', '') AS DECIMAL(12,2))
             < CAST(REPLACE(REPLACE(COALESCE(valor, '0'), ',', '.'), ' ', '') AS DECIMAL(12,2))
         AND categoria_nome IN ('Fidelidade', 'Cortesia')
         AND cliente_cpf IS NOT NULL
         AND data_gerado >= '2026-01-01'
         AND user_id = ?
       ORDER BY id`,
      [userId]
    ) as any[];

    const vouchers = Array.isArray(rows) ? rows : [];
    console.log('Vouchers a processar:', vouchers.length);
    vouchers.forEach((v: any) => console.log('  ', v.id, v.codigo, v.cliente_cpf, v.categoria_nome));

    let totalInseridos = 0;
    let totalIgnorados = 0;

    for (const v of vouchers) {
      const movResult = await vmLavService.buscarMovimentacoesVoucher(token, v.id_voucher_vm);
      if (!movResult.success) {
        console.log('\nVoucher', v.codigo, '(id', v.id, '): API falhou:', movResult.error || 'unknown');
        continue;
      }
      const elementos = movResult.elementos || [];
      console.log('\nVoucher', v.codigo, '(id_voucher_vm', v.id_voucher_vm, '):', elementos.length, 'movimentação(ões)');

      for (const m of elementos as any[]) {
        const tipoMovimento = m.tipoMovimento ?? null;
        let dataMovimentacao: Date | null = null;
        if (m.dataMovimentacao) {
          const str = m.dataMovimentacao?.endsWith('Z') ? m.dataMovimentacao : m.dataMovimentacao + 'Z';
          dataMovimentacao = new Date(str);
        }
        const valor = m.valor != null ? Math.abs(parseFloat(m.valor)) : null;

        const maquinaProp = m.transacaoConta?.propriedades?.find(
          (p: any) => p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
        );
        let equipamentoNumeroSerie: string | null = maquinaProp?.propriedade?.numeroSerie ?? maquinaProp?.propriedade?.descricao ?? null;
        if (equipamentoNumeroSerie) equipamentoNumeroSerie = String(equipamentoNumeroSerie).trim();

        const localProp = m.transacaoConta?.propriedades?.find(
          (p: any) => p.classe?.nome === 'LAVANDERIA'
        );
        const localNome: string | null = localProp?.propriedade?.descricao ?? null;

        try {
          // MariaDB driver: INSERT retorna { affectedRows, insertId, ... }, não array
          const result = await conn.query(
            `INSERT IGNORE INTO vm_lav_vouchers_movimentos
             (id_voucher_vm, user_id, tipo_movimento, data_movimentacao, valor, equipamento_numero_serie, local_nome)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              v.id_voucher_vm,
              userId,
              tipoMovimento,
              dataMovimentacao,
              valor,
              equipamentoNumeroSerie,
              localNome,
            ]
          ) as any;
          const affected = result?.affectedRows ?? 0;
          if (affected === 1) {
            totalInseridos++;
            console.log('   Inserido:', tipoMovimento, dataMovimentacao?.toISOString(), 'valor', valor, 'serial', equipamentoNumeroSerie);
          } else {
            totalIgnorados++;
          }
        } catch (err: any) {
          console.error('   Erro ao inserir movimento:', err.message);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  Total inseridos:', totalInseridos, '| já existentes (ignorados):', totalIgnorados);
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } finally {
    conn.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
