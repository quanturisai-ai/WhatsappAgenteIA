/**
 * Script de verificação: PROGRESSO de fidelização vs automação
 * - Config fidelizacao_config (notificar_progresso)
 * - Config fidelizacao_regras_config (ativo)
 * - Resumo de notificações PROGRESSO e por regra
 * - Pedidos recentes sem PROGRESSO (candidatos a "não gravados")
 * Execute: npm run verificar:progresso (ou ts-node src/scripts/verificar-progresso-fidelizacao.ts)
 */
import pool from '../config/database';

async function run() {
  console.log('=== Verificação PROGRESSO fidelização ===\n');

  const conn = await pool.getConnection();
  try {
    // 1. Config fidelização (notificar_progresso)
    const [configRows] = await conn.query(
      `SELECT user_id, notificar_conquistas, notificar_progresso, simulacao
       FROM fidelizacao_config`
    ) as any[];
    const configList = Array.isArray(configRows) ? configRows : [];
    console.log('1. fidelizacao_config (notificar_progresso):');
    if (configList.length === 0) {
      console.log('   Nenhum registro.');
    } else {
      configList.forEach((r: any) => {
        console.log(`   user_id=${r.user_id} notificar_progresso=${r.notificar_progresso} notificar_conquistas=${r.notificar_conquistas} simulacao=${r.simulacao}`);
      });
    }

    // 2. Config regras (ativo)
    const [regrasConfigRows] = await conn.query(
      `SELECT user_id, ativo, simulacao
       FROM fidelizacao_regras_config`
    ) as any[];
    const regrasConfigList = Array.isArray(regrasConfigRows) ? regrasConfigRows : [];
    console.log('\n2. fidelizacao_regras_config (automação ativa):');
    if (regrasConfigList.length === 0) {
      console.log('   Nenhum registro.');
    } else {
      regrasConfigList.forEach((r: any) => {
        console.log(`   user_id=${r.user_id} ativo=${r.ativo} simulacao=${r.simulacao}`);
      });
    }

    // 3. Resumo notificações: PROGRESSO vs por regra
    const [summaryRows] = await conn.query(
      `SELECT user_id, tipo_notificacao,
              COUNT(*) as total,
              SUM(CASE WHEN enviado_whatsapp = 1 THEN 1 ELSE 0 END) as enviados,
              SUM(CASE WHEN erro IS NOT NULL AND erro != '' THEN 1 ELSE 0 END) as com_erro
       FROM fidelizacao_notificacoes
       GROUP BY user_id, tipo_notificacao
       ORDER BY user_id, tipo_notificacao`
    ) as any[];
    const summaryList = Array.isArray(summaryRows) ? summaryRows : [];
    console.log('\n3. Resumo fidelizacao_notificacoes (por user_id e tipo):');
    summaryList.forEach((r: any) => {
      console.log(`   user_id=${r.user_id} tipo=${r.tipo_notificacao} total=${r.total} enviados=${r.enviados} com_erro=${r.com_erro}`);
    });

    // 4. PROGRESSO com erro (amostra)
    const [erroRows] = await conn.query(
      `SELECT id, user_id, pedido_id, cpf_cliente, enviado_whatsapp, LEFT(erro, 80) as erro_preview, data_envio
       FROM fidelizacao_notificacoes
       WHERE tipo_notificacao = 'PROGRESSO' AND erro IS NOT NULL AND erro != ''
       ORDER BY data_envio DESC
       LIMIT 15`
    ) as any[];
    const erroList = Array.isArray(erroRows) ? erroRows : [];
    console.log('\n4. Amostra PROGRESSO com erro (últimos 15):');
    if (erroList.length === 0) {
      console.log('   Nenhum.');
    } else {
      erroList.forEach((r: any) => {
        console.log(`   id=${r.id} user_id=${r.user_id} pedido_id=${r.pedido_id} enviado=${r.enviado_whatsapp} erro="${r.erro_preview}" data_envio=${r.data_envio}`);
      });
    }

    // 5. Pedidos elegíveis (Sucesso, pago_com_fidelidade=0) sem PROGRESSO (amostra por user)
    const [semProgRows] = await conn.query(
      `SELECT p.user_id, p.id as pedido_id, p.cliente_cpf, p.data_venda, p.situacao_venda, p.pago_com_fidelidade
       FROM vm_lav_pedidos p
       WHERE p.situacao_venda = 'Sucesso'
         AND COALESCE(p.pago_com_fidelidade, 0) = 0
         AND p.cliente_cpf IS NOT NULL AND TRIM(p.cliente_cpf) != ''
         AND NOT EXISTS (
           SELECT 1 FROM fidelizacao_notificacoes n
           WHERE n.user_id = p.user_id AND n.pedido_id = p.id AND n.tipo_notificacao = 'PROGRESSO'
         )
       ORDER BY p.data_venda DESC
       LIMIT 20`
    ) as any[];
    const semProgList = Array.isArray(semProgRows) ? semProgRows : [];
    console.log('\n5. Pedidos elegíveis SEM notificação PROGRESSO (últimos 20 por data_venda):');
    if (semProgList.length === 0) {
      console.log('   Nenhum (todos os elegíveis já têm PROGRESSO ou não há pedidos).');
    } else {
      semProgList.forEach((r: any) => {
        console.log(`   user_id=${r.user_id} pedido_id=${r.pedido_id} cpf=${r.cliente_cpf} data_venda=${r.data_venda}`);
      });
    }

    console.log('\n=== Fim da verificação ===');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
