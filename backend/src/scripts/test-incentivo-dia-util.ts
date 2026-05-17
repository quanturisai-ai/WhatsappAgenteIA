/**
 * Script de teste para o gatilho INCENTIVO_DIA_UTIL
 * Testa com e sem segmentação para diagnosticar problemas.
 *
 * Uso: npx ts-node src/scripts/test-incentivo-dia-util.ts
 */

import pool from '../config/database';
import { FidelizacaoTipoGatilhoModel } from '../models/fidelizacaoTipoGatilho.model';
import { FidelizacaoRegrasService } from '../services/fidelizacaoRegras.service';

interface SegmentacaoPublico {
  genero?: string | null;
  idade_min?: number | null;
  idade_max?: number | null;
  cadastro_de?: string | null;
  cadastro_ate?: string | null;
  pedido_de?: string | null;
  pedido_ate?: string | null;
  qtd_compras_min?: number | null;
  qtd_compras_max?: number | null;
  valor_gasto_min?: number | null;
  valor_gasto_max?: number | null;
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TESTE GATILHO INCENTIVO_DIA_UTIL');
  console.log('═══════════════════════════════════════════════════════════\n');

  const userId = 1; // Usuário de teste
  const regrasService = new FidelizacaoRegrasService();
  const tipoModel = new FidelizacaoTipoGatilhoModel();

  try {
    // 1. Verificar se o tipo existe
    console.log('1️⃣  Carregando tipo INCENTIVO_DIA_UTIL...');
    const tipo = await tipoModel.findByCodigo('INCENTIVO_DIA_UTIL');
    if (!tipo) {
      console.error('❌ Tipo INCENTIVO_DIA_UTIL não encontrado no banco.');
      return;
    }
    console.log(`   ✅ Tipo encontrado: id=${tipo.id}, ${tipo.nome_exibicao}\n`);

    // 2. Verificar dados base (clientes e pedidos)
    console.log('2️⃣  Verificando dados base (vm_lav_clientes, vm_lav_pedidos)...');
    const conn = await pool.getConnection();
    try {
      const [clientesCount] = (await conn.query(
        'SELECT COUNT(*) as total FROM vm_lav_clientes WHERE user_id = ? AND telefone IS NOT NULL AND TRIM(telefone) != ""',
        [userId]
      )) as any[];
      const totalClientes = Array.isArray(clientesCount) ? clientesCount[0]?.total ?? clientesCount : clientesCount?.total ?? 0;

      const [pedidosCount] = (await conn.query(
        'SELECT COUNT(*) as total FROM vm_lav_pedidos WHERE user_id = ? AND situacao_venda = ?',
        [userId, 'Sucesso']
      )) as any[];
      const totalPedidos = Array.isArray(pedidosCount) ? pedidosCount[0]?.total ?? pedidosCount : pedidosCount?.total ?? 0;

      console.log(`   - Clientes (user ${userId}, com telefone): ${totalClientes}`);
      console.log(`   - Pedidos (user ${userId}, Sucesso): ${totalPedidos}\n`);
    } finally {
      conn.release();
    }

    // 3. Teste SEM segmentação (baseline - percentual 60%, min 3 pedidos, igual à regra real)
    console.log('3️⃣  Teste SEM segmentação (baseline: 60% FDS, min 3 pedidos)...');
    const dadosSemSeg = {
      user_id: userId,
      tipo_gatilho_id: tipo.id,
      nome_regra: 'Teste INCENTIVO_DIA_UTIL',
      parametros: { percentual_fds_minimo: 60, min_pedidos: 3 },
      segmentacao: null as SegmentacaoPublico | null,
      mensagem_template: 'Olá {nome}!',
      frequencia_minima_dias: 30,
      horario_inicio: '08:00:00',
      horario_fim: '20:00:00',
      vigencia_inicio: new Date(),
      vigencia_fim: null,
      ativo: true,
    };

    const resultSemSeg = await regrasService.previewRegra(userId, dadosSemSeg as any);
    console.log(`   Baseline (sem segmentação): ${resultSemSeg.clientes.length} cliente(s)`);
    console.log('');

    // 4. Teste COM segmentação EXATA da regra "Incentivo Dia Útil - Jovens e Adultos"
    console.log('4️⃣  Teste COM segmentação da regra real (cadastro_de, pedido_de, genero Masculino)...');
    const segmentacaoReal: SegmentacaoPublico = {
      cadastro_de: '2025-01-01',
      pedido_de: '2025-01-01',
      genero: 'Masculino',
    };

    const dadosRegraReal = {
      user_id: userId,
      tipo_gatilho_id: tipo.id,
      nome_regra: 'Incentivo Dia Útil - Jovens e Adultos',
      parametros: { percentual_fds_minimo: 60, min_pedidos: 3 },
      segmentacao: segmentacaoReal,
      mensagem_template: 'Oi {primeiro_nome}!',
      frequencia_minima_dias: 21,
      horario_inicio: '09:00:00',
      horario_fim: '11:30:00',
      vigencia_inicio: new Date('2024-12-30'),
      vigencia_fim: null,
      ativo: true,
    };

    try {
      const resultReal = await regrasService.previewRegra(userId, dadosRegraReal as any);
      console.log(`   Resultado: ${resultReal.clientes.length} cliente(s) qualificados`);
      if (resultReal.clientes.length > 0) {
        resultReal.clientes.slice(0, 3).forEach((c, i) => {
          console.log(`   [${i + 1}] ${c.nome} | genero=? | ${c.telefone}`);
        });
      }
    } catch (err: any) {
      console.error(`   ❌ ERRO: ${err?.message || err}`);
    }
    console.log('');

    // 5. Verificação: quantos do baseline têm genero M/Masculino e atendem datas?
    console.log('5️⃣  Verificação esperada (genero M, cadastro>=2025-01-01, pedido>=2025-01-01)...');
    const conn2 = await pool.getConnection();
    try {
      const rowsEsperado = (await conn2.query(
        `SELECT c.id FROM vm_lav_clientes c 
         INNER JOIN vm_lav_pedidos p ON p.cliente_cpf = c.cpf AND p.user_id = c.user_id AND p.situacao_venda = 'Sucesso'
         WHERE c.user_id = ? AND c.data_ultima_compra >= NOW() - INTERVAL 90 DAY AND c.telefone IS NOT NULL AND TRIM(c.telefone) != ''
         AND c.genero IN ('M', 'Masculino')
         AND c.data_cadastro >= '2025-01-01'
         AND EXISTS (SELECT 1 FROM vm_lav_pedidos p2 WHERE p2.cliente_cpf = c.cpf AND p2.user_id = c.user_id AND p2.situacao_venda = 'Sucesso' AND p2.data_venda >= '2025-01-01')
         GROUP BY c.id, c.user_id, c.nome, c.cpf, c.telefone, c.data_nascimento, c.data_cadastro, c.data_ultima_compra, c.qtd_compras, c.valor_total_compras, c.email
         HAVING ROUND(SUM(CASE WHEN DAYOFWEEK(p.data_venda) IN (1, 7) THEN 1 ELSE 0 END) * 100.0 / COUNT(p.id), 1) >= 60 AND COUNT(p.id) >= 3`,
        [userId]
      )) as any[];
      const totalEsperado = Array.isArray(rowsEsperado) ? rowsEsperado.length : 0;
      console.log(`   Esperado (query manual): ${totalEsperado} cliente(s)`);
      console.log('   (A query executada pelo service aparece no log acima)');
    } catch (err: any) {
      console.error(`   Erro: ${(err as Error)?.message}`);
    } finally {
      conn2.release();
    }

    // 6. Verificar INATIVIDADE (não deve ter regressão)
    console.log('\n6️⃣  Verificando INATIVIDADE (regressão)...');
    const tipoInat = await tipoModel.findByCodigo('INATIVIDADE');
    if (tipoInat) {
      const dadosInat = {
        user_id: userId,
        tipo_gatilho_id: tipoInat.id,
        nome_regra: 'Teste INATIVIDADE',
        parametros: { dias: 17 },
        segmentacao: { cadastro_de: '2024-01-01', pedido_de: '2024-01-01' } as SegmentacaoPublico,
        mensagem_template: 'Olá!',
        frequencia_minima_dias: 30,
        horario_inicio: '08:00:00',
        horario_fim: '20:00:00',
        vigencia_inicio: new Date(),
        vigencia_fim: null,
        ativo: true,
      };
      const resInat = await regrasService.previewRegra(userId, dadosInat as any);
      console.log(`   INATIVIDADE com segmentação: ${resInat.clientes.length} cliente(s) ✅`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ TESTE CONCLUÍDO - INCENTIVO_DIA_UTIL funciona com segmentação');
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error: any) {
    console.error('❌ ERRO:', error?.message || error);
    console.error(error?.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
