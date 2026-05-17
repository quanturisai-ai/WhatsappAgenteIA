/**
 * Diagnóstico: pedidos de uma data vs notificações PROGRESSO
 * - Compara clientes com pedido na data vs clientes com PROGRESSO na data
 * - Lista quem não recebeu e verifica regras (pago_com_fidelidade, barreira, telefone, config)
 * - Lista todas as notificações do dia por tipo
 * - Passo a passo do fluxo de envio de PROGRESSO
 *
 * Execute: npm run diagnostico:progresso-08-03
 * Ou com data: DIAG_DATA=2026-03-08 npm run diagnostico:progresso-08-03
 */
import pool from '../config/database';

const DATA_DIA = process.env.DIAG_DATA || '2026-03-08';

// Normaliza CPF para comparação (só dígitos)
function normalizarCpf(cpf: string | null): string {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log('========================================');
    console.log(`DIAGNÓSTICO PROGRESSO - ${DATA_DIA}`);
    console.log('========================================\n');

    // --- 1. PEDIDOS DO DIA (elegíveis: Sucesso, pago_com_fidelidade=0, cpf preenchido) ---
    const pedidosResult = await conn.query(
      `SELECT p.id, p.user_id, p.cliente_cpf, p.data_venda, p.situacao_venda, p.pago_com_fidelidade,
              REPLACE(REPLACE(REPLACE(COALESCE(p.cliente_cpf,''),'.',''),'-',''),' ','') AS cpf_norm
       FROM vm_lav_pedidos p
       WHERE DATE(p.data_venda) = ?
         AND p.situacao_venda = 'Sucesso'
         AND p.cliente_cpf IS NOT NULL AND TRIM(p.cliente_cpf) != ''
       ORDER BY p.user_id, p.data_venda`,
      [DATA_DIA]
    ) as any;
    const pedidos: any[] = Array.isArray(pedidosResult)
      ? (Array.isArray(pedidosResult[0]) ? pedidosResult[0] : pedidosResult)
      : [];
    const cpfsComPedidoElegivel = new Map<number, Set<string>>(); // user_id -> Set(cpf_norm)
    const cpfsComPedidoQualquer = new Map<number, Set<string>>();  // todos os pedidos do dia (incl. pago_com_fidelidade=1)
    const pedidosPorUserCpf = new Map<number, Map<string, { pedidoIds: number[]; pagoComFidelidade: number }>>();

    for (const p of pedidos) {
      const cpfNorm = (p.cpf_norm || normalizarCpf(p.cliente_cpf)).slice(0, 11);
      if (!cpfNorm) continue;
      const uid = p.user_id;
      if (!cpfsComPedidoQualquer.has(uid)) {
        cpfsComPedidoQualquer.set(uid, new Set());
        cpfsComPedidoElegivel.set(uid, new Set());
      }
      cpfsComPedidoQualquer.get(uid)!.add(cpfNorm);
      if (Number(p.pago_com_fidelidade) === 0) {
        cpfsComPedidoElegivel.get(uid)!.add(cpfNorm);
      }
      if (!pedidosPorUserCpf.has(uid)) pedidosPorUserCpf.set(uid, new Map());
      const byCpf = pedidosPorUserCpf.get(uid)!;
      if (!byCpf.has(cpfNorm)) byCpf.set(cpfNorm, { pedidoIds: [], pagoComFidelidade: 0 });
      const ent = byCpf.get(cpfNorm)!;
      ent.pedidoIds.push(p.id);
      if (Number(p.pago_com_fidelidade) === 1) ent.pagoComFidelidade = 1;
    }

    console.log('1. PEDIDOS DO DIA (Sucesso, cpf preenchido)');
    console.log(`   Total de registros: ${pedidos.length}`);
    const usersComPedido = new Set(pedidos.map((p: any) => p.user_id));
    usersComPedido.forEach((uid) => {
      const elegiveis = cpfsComPedidoElegivel.get(uid)?.size ?? 0;
      const todos = cpfsComPedidoQualquer.get(uid)?.size ?? 0;
      console.log(`   user_id=${uid}: ${todos} CPF(s) com pedido, ${elegiveis} elegíveis (pago_com_fidelidade=0)`);
    });

    // --- 2. NOTIFICAÇÕES PROGRESSO DO DIA (data_envio = hoje) ---
    const progResult = await conn.query(
      `SELECT id, user_id, cpf_cliente, pedido_id, data_venda, data_envio, enviado_whatsapp, LEFT(erro, 60) AS erro_preview,
              REPLACE(REPLACE(REPLACE(COALESCE(cpf_cliente,''),'.',''),'-',''),' ','') AS cpf_norm
       FROM fidelizacao_notificacoes
       WHERE tipo_notificacao = 'PROGRESSO'
         AND (DATE(data_envio) = ? OR DATE(data_venda) = ?)
       ORDER BY user_id, data_envio`,
      [DATA_DIA, DATA_DIA]
    ) as any;
    const progressoList: any[] = Array.isArray(progResult)
      ? (Array.isArray(progResult[0]) ? progResult[0] : progResult)
      : [];
    const cpfsComProgresso = new Map<number, Set<string>>();
    for (const n of progressoList) {
      const cpfNorm = (n.cpf_norm || normalizarCpf(n.cpf_cliente)).slice(0, 11);
      if (!cpfNorm) continue;
      const uid = n.user_id;
      if (!cpfsComProgresso.has(uid)) cpfsComProgresso.set(uid, new Set());
      cpfsComProgresso.get(uid)!.add(cpfNorm);
    }

    console.log('\n2. NOTIFICAÇÕES PROGRESSO DO DIA (data_envio ou data_venda = ' + DATA_DIA + ')');
    console.log(`   Total: ${progressoList.length}`);
    cpfsComProgresso.forEach((set, uid) => {
      const comErro = progressoList.filter((n: any) => n.user_id === uid && n.erro_preview);
      console.log(`   user_id=${uid}: ${set.size} CPF(s) com PROGRESSO, ${comErro.length} com erro no envio`);
    });

    // --- 3. GAP: clientes com pedido elegível hoje SEM PROGRESSO hoje ---
    console.log('\n3. GAP – Clientes com pedido elegível em ' + DATA_DIA + ' SEM notificação PROGRESSO no dia');
    const gapPorUser = new Map<number, string[]>();
    cpfsComPedidoElegivel.forEach((setCpf, uid) => {
      const comProg = cpfsComProgresso.get(uid) || new Set();
      const faltando = [...setCpf].filter((cpf) => !comProg.has(cpf));
      if (faltando.length) gapPorUser.set(uid, faltando);
    });
    if (gapPorUser.size === 0) {
      console.log('   Nenhum. Todos os clientes elegíveis receberam PROGRESSO.');
    } else {
      gapPorUser.forEach((cpfs, uid) => {
        console.log(`   user_id=${uid}: ${cpfs.length} CPF(s) sem PROGRESSO: ${cpfs.slice(0, 5).join(', ')}${cpfs.length > 5 ? '...' : ''}`);
      });
    }

    // --- 3b. Para cada CPF dos 29 pedidos: quais notificações recebeu hoje? ---
    console.log('\n3b. CLIENTES COM PEDIDO HOJE – Notificações recebidas no dia (por tipo)');
    const notifHojeResult = await conn.query(
      `SELECT user_id, tipo_notificacao,
              REPLACE(REPLACE(REPLACE(COALESCE(cpf_cliente,''),'.',''),'-',''),' ','') AS cpf_norm,
              COUNT(*) AS qtd
       FROM fidelizacao_notificacoes
       WHERE DATE(data_envio) = ?
       GROUP BY user_id, tipo_notificacao, cpf_norm`,
      [DATA_DIA]
    ) as any;
    const notifHojeRows: any[] = Array.isArray(notifHojeResult)
      ? (Array.isArray(notifHojeResult[0]) ? notifHojeResult[0] : notifHojeResult)
      : [];
    const notifPorCpf = new Map<string, Map<string, number>>(); // "uid:cpf" -> { tipo: qtd }
    for (const r of notifHojeRows) {
      const cpfNorm = (r.cpf_norm || '').slice(0, 11);
      if (!cpfNorm) continue;
      const key = `${r.user_id}:${cpfNorm}`;
      if (!notifPorCpf.has(key)) notifPorCpf.set(key, new Map());
      notifPorCpf.get(key)!.set(r.tipo_notificacao, Number(r.qtd));
    }
    const todosCpfsPedido = new Map<number, string[]>();
    cpfsComPedidoQualquer.forEach((set, uid) => {
      todosCpfsPedido.set(uid, [...set].sort());
    });
    const tiposOrdenados = ['PROGRESSO', 'CONQUISTA', 'ENTREGA', 'ANIVERSARIO', 'INCENTIVO_DIA_UTIL', 'QTD_COMPRAS', 'INATIVIDADE'];
    todosCpfsPedido.forEach((cpfs, uid) => {
      console.log(`\n   user_id=${uid}:`);
      for (const cpf of cpfs) {
        const key = `${uid}:${cpf}`;
        const tipos = notifPorCpf.get(key);
        const recebeuProg = cpfsComProgresso.get(uid)?.has(cpf);
        const noGap = gapPorUser.get(uid)?.includes(cpf);
        const partes: string[] = [];
        if (tipos) {
          for (const t of tiposOrdenados) {
            const q = tipos.get(t);
            if (q) partes.push(`${t}=${q}`);
          }
          const outros = [...tipos.keys()].filter((t) => !tiposOrdenados.includes(t));
          outros.forEach((t) => partes.push(`${t}=${tipos.get(t)}`));
        }
        const status = recebeuProg ? '✓PROGRESSO' : noGap ? '✗sem PROGRESSO' : '-';
        console.log(`      CPF ${cpf}: ${status} | ${partes.length ? partes.join(', ') : 'nenhuma notificação hoje'}`);
      }
    });

    // --- 4. Por que faltou? Para cada user com gap, checar config, barreira, watermark, telefone ---
    console.log('\n4. VERIFICAÇÃO POR QUE NÃO ENVIOU (para usuários com gap ou com pedidos no dia)');
    for (const uid of usersComPedido) {
      const configResult = await conn.query(
        `SELECT notificar_progresso, notificar_conquistas, simulacao, simulacao_desativada_em
         FROM fidelizacao_config WHERE user_id = ?`,
        [uid]
      ) as any;
      const configRows = Array.isArray(configResult) ? (Array.isArray(configResult[0]) ? configResult[0] : configResult) : [];
      const config = configRows.length ? configRows[0] : null;
      const notificarProgresso = config?.notificar_progresso === 1 || config?.notificar_progresso === true;
      const dataBarreira = config?.simulacao_desativada_em ? new Date(config.simulacao_desativada_em) : null;

      const wmResult = await conn.query(
        `SELECT MAX(data_venda) AS max_data FROM vm_lav_pedidos WHERE user_id = ?`,
        [uid]
      ) as any;
      const wmRows = Array.isArray(wmResult) ? (Array.isArray(wmResult[0]) ? wmResult[0] : wmResult) : [];
      const maxDataVenda = wmRows[0]?.max_data ? new Date(wmRows[0].max_data) : null;

      const cpfsGap = gapPorUser.get(uid) || [];
      const byCpf = pedidosPorUserCpf.get(uid);
      console.log(`\n   --- user_id=${uid} ---`);
      console.log(`   notificar_progresso=${notificarProgresso} simulacao=${config?.simulacao} barreira=${dataBarreira?.toISOString() ?? 'null'}`);
      console.log(`   MAX(data_venda) em vm_lav_pedidos: ${maxDataVenda?.toISOString() ?? 'null'}`);
      if (cpfsGap.length > 0 && byCpf) {
        let semTelefone = 0;
        for (const cpfNorm of cpfsGap.slice(0, 10)) {
          const cliResult = await conn.query(
            `SELECT id, nome, telefone FROM vm_lav_clientes
             WHERE user_id = ? AND REPLACE(REPLACE(REPLACE(COALESCE(cpf,''),'.',''),'-',''),' ','') = ?`,
            [uid, cpfNorm]
          ) as any;
          const cliRows = Array.isArray(cliResult) ? (Array.isArray(cliResult[0]) ? cliResult[0] : cliResult) : [];
          const c = cliRows.length ? cliRows[0] : null;
          if (!c || !c.telefone || String(c.telefone).trim() === '') semTelefone++;
        }
        console.log(`   Amostra dos ${cpfsGap.length} em gap: verificado até 10; sem telefone na amostra: ${semTelefone}`);
      }
    }

    // --- 5. Todas as notificações de hoje por tipo ---
    const todasResult = await conn.query(
      `SELECT tipo_notificacao, COUNT(*) AS total,
              SUM(CASE WHEN enviado_whatsapp = 1 THEN 1 ELSE 0 END) AS enviados,
              SUM(CASE WHEN erro IS NOT NULL AND erro != '' THEN 1 ELSE 0 END) AS com_erro
       FROM fidelizacao_notificacoes
       WHERE DATE(data_envio) = ?
       GROUP BY tipo_notificacao
       ORDER BY tipo_notificacao`,
      [DATA_DIA]
    ) as any;
    const todas: any[] = Array.isArray(todasResult) ? (Array.isArray(todasResult[0]) ? todasResult[0] : todasResult) : [];
    console.log('\n5. TODAS AS NOTIFICAÇÕES DO DIA (por tipo)');
    if (todas.length === 0) {
      console.log('   Nenhuma notificação com data_envio em ' + DATA_DIA);
    } else {
      todas.forEach((r: any) => {
        console.log(`   ${r.tipo_notificacao}: total=${r.total} enviados_whatsapp=${r.enviados} com_erro=${r.com_erro}`);
      });
    }

    // --- 6. Passo a passo do fluxo de envio de PROGRESSO ---
    console.log('\n========================================');
    console.log('PASSO A PASSO – Verificação de envio de PROGRESSO');
    console.log('========================================\n');
    console.log(`
ETAPA 1 – Sincronização (vmLavScheduler.sincronizarUsuario)
  1.1 Credenciais vm_lav ativas? Se não → para aqui.
  1.2 Captura WATERMARK = MAX(data_venda) em vm_lav_pedidos (ANTES do sync).
  1.3 Sync clientes, pedidos (7 dias), vouchers, movimentos.
  1.4 Marcar pedidos pago_com_fidelidade (por movimentos).
  1.5 Se watermarkAntesDaSync === null → "Primeira sincronização: pedidos históricos não geram notificações" → PARA AQUI (não envia PROGRESSO).

ETAPA 2 – Quem entra na fila de notificação
  2.1 Ler fidelizacao_config: notificar_progresso, simulacao_desativada_em (dataBarreira).
  2.2 buscarPedidosNovosPorCpf(userId, watermarkAntesDaSync, dataBarreira):
      - Pedidos onde: user_id, data_venda > watermark, data_venda >= dataBarreira (se houver),
        situacao_venda = 'Sucesso', pago_com_fidelidade = 0, cliente_cpf preenchido.
      - Agrupa por CPF (fica 1 pedido mais recente por CPF).
  2.3 Se notificar_progresso = false → nenhum PROGRESSO enviado.
  2.4 Se pedidosNovosPorCpf.size === 0 → "Nenhum pedido genuinamente novo" → não envia PROGRESSO.

ETAPA 3 – Para cada CPF na fila: enviarNotificacaoProgressoPorPedido
  3.1 Se config.notificar_progresso = false → return (não grava nem envia).
  3.2 Buscar cliente por CPF em vm_lav_clientes. Se não existe ou sem telefone → log e return (não grava).
  3.3 Obter saldos e montar mensagem.
  3.4 INSERT em fidelizacao_notificacoes (pedido_id, data_venda, tipo PROGRESSO).
  3.5 Se config.simulacao = true → só log "[SIMULAÇÃO]"; não envia WhatsApp.
  3.6 Se WhatsApp não está pronto → update notificação com erro "WhatsApp não está pronto".
  3.7 Envia WhatsApp; se falhar → update com erro (ex.: mensagem truncada "t").

PONTOS ONDE PODE TRAVAR (sem gravar PROGRESSO):
  - Antes da etapa 3: watermark null (1.5), notificar_progresso false (2.3), fila vazia (2.4).
  - Pedido excluído da fila: pago_com_fidelidade = 1, ou data_venda <= watermark, ou data_venda < dataBarreira.
  - Dentro da etapa 3: cliente sem telefone (3.2); duplicata no INSERT (3.4) → exceção tratada.
  - Após gravar: envio falha (3.6 ou 3.7) → notificação fica com erro; registro existe.
`);

    console.log('\n========================================');
    console.log('FIM DO DIAGNÓSTICO');
    console.log('========================================\n');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
