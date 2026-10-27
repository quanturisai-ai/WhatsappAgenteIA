/**
 * Script temporário: gera notificações de progresso para clientes que não foram
 * notificados durante o período de inatividade do sistema (01/07 a 05/07/2026).
 *
 * Regras:
 *  - 1 notificação por CPF (pedido mais recente do período, saldo atual)
 *  - Só processa CPFs sem nenhuma notificação PROGRESSO prévia
 *  - WhatsApp desconectado: grava com enviado_whatsapp=false para envio manual posterior
 *
 * Uso:
 *   Fase 1 — teste com 1 CPF:  npx ts-node scripts/notificar-progresso-offline.ts
 *   Fase 2 — todos os CPFs:    npx ts-node scripts/notificar-progresso-offline.ts --todos
 *
 * Deletar após uso.
 */

import pool from '../src/config/database';
import { FidelizacaoNotificacaoService } from '../src/services/fidelizacaoNotificacao.service';

const USER_ID = 1;
const PERIODO_INICIO = '2026-06-30';
const PERIODO_FIM    = '2026-07-05 23:59:59';

// Fase 1: apenas este CPF para validação
const CPF_TESTE = '009.516.751-09';

// Fase 2: restantes (só usados com --todos)
const CPFS_RESTANTES = [
  '030.691.241-43',
  '035.596.821-50',
  '619.713.223-00',
  '754.734.611-15',
  '085.424.381-08',
  '085.630.421-22',
  '451.597.501-34',
  '711.928.791-55',
];

async function main() {
  const modoTodos = process.argv.includes('--todos');
  const cpfs = modoTodos ? CPFS_RESTANTES : [CPF_TESTE];

  console.log(`\nModo: ${modoTodos ? 'TODOS OS CPFs RESTANTES' : 'TESTE — 1 CPF'}`);
  console.log(`CPFs a processar: ${cpfs.join(', ')}\n`);

  const service = new FidelizacaoNotificacaoService();
  const conn = await pool.getConnection();

  try {
    // 1 linha por CPF: pedido mais recente do período offline, sem notificação prévia
    const placeholders = cpfs.map(() => '?').join(', ');
    const result = await conn.query(
      `SELECT
         cliente_cpf,
         MAX(id)         AS pedido_id,
         MAX(data_venda) AS data_venda
       FROM vm_lav_pedidos
       WHERE user_id = ?
         AND data_venda > ?
         AND data_venda <= ?
         AND situacao_venda = 'Sucesso'
         AND pago_com_fidelidade = 0
         AND cliente_cpf IN (${placeholders})
         AND cliente_cpf NOT IN (
           SELECT cpf_cliente
           FROM fidelizacao_notificacoes
           WHERE user_id = ? AND tipo_notificacao = 'PROGRESSO'
         )
       GROUP BY cliente_cpf
       ORDER BY data_venda DESC`,
      [USER_ID, PERIODO_INICIO, PERIODO_FIM, ...cpfs, USER_ID]
    ) as any;

    const rows: any[] = Array.isArray(result[0]) ? result[0] : result;

    if (rows.length === 0) {
      console.log('Nenhum CPF elegível encontrado (todos já têm notificação ou sem pedido no período).');
      return;
    }

    console.log(`${rows.length} CPF(s) elegível(is) encontrado(s):\n`);

    for (const row of rows) {
      const cpf      = row.cliente_cpf as string;
      const pedidoId = Number(row.pedido_id);
      const dataVenda = new Date(row.data_venda);

      console.log(`→ CPF: ${cpf} | pedido_id: ${pedidoId} | data_venda: ${dataVenda.toISOString()}`);

      try {
        await service.enviarNotificacaoProgressoPorPedido(USER_ID, cpf, pedidoId, dataVenda);
        console.log(`  ✓ Notificação criada (enviado_whatsapp=false — aguardando envio manual)\n`);
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
          console.log(`  ⚠ Já existe notificação para este pedido — pulado.\n`);
        } else {
          console.error(`  ✗ Erro: ${err.message}\n`);
        }
      }
    }

    console.log('Concluído. Verifique a notificação criada na tela de Notificações do sistema.');
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
