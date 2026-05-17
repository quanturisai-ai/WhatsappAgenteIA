/**
 * Script: usa a sessão VM Lav (token) para listar vouchers na API,
 * verifica se o código 2TS2S3Z7 (gerado hoje) aparece na lista
 * e se está na tabela vm_lav_vouchers.
 *
 * Uso: npm run check:voucher-list [userId]
 * Ex.: npm run check:voucher-list 1
 */

import 'dotenv/config';
import pool from '../config/database';
import { VmLavService } from '../services/vmLav.service';

const CODIGO_BUSCA = '2TS2S3Z7';

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const vmLavService = new VmLavService();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Check: Lista de vouchers (API) e presença no banco');
  console.log('  user_id =', userId, '| código buscado =', CODIGO_BUSCA);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Obter token (sessão já aberta)
    const token = await vmLavService.obterTokenValido(userId);
    if (!token) {
      console.error('Token inválido. Não foi possível obter token para o usuário.', userId);
      process.exit(1);
    }
    console.log('Token obtido (sessão VM Lav ativa).\n');

    // 2. Listar vouchers da API (todas as páginas, mesma lógica do sync)
    let todosVouchers: any[] = [];
    let pagina = 0;
    const quantidadePorPagina = 100;
    let totalApi = 0;

    do {
      const resultado = await vmLavService.buscarVouchers(token, 'lavateriajdnovomundo', pagina, quantidadePorPagina);
      if (!resultado.success || !resultado.vouchers) {
        console.error('Erro ao buscar vouchers na API:', resultado.error || 'resposta inválida');
        process.exit(1);
      }
      todosVouchers = todosVouchers.concat(resultado.vouchers);
      totalApi = resultado.total || 0;
      console.log(`  API página ${pagina}: ${resultado.vouchers.length} itens (total API: ${totalApi})`);
      pagina++;
      if (todosVouchers.length >= totalApi || resultado.vouchers.length === 0) break;
    } while (true);

    console.log('\nTotal de vouchers retornados pela API:', todosVouchers.length);

    // 3. Procurar código na lista (estrutura: row[1] = codigo, row[0] = data criacao)
    const naLista = todosVouchers.filter((row: any) => (row[1] || '').toString().trim() === CODIGO_BUSCA);
    const encontradoNaApi = naLista.length > 0;

    if (encontradoNaApi) {
      const row = naLista[0];
      console.log('\n  [API] Código', CODIGO_BUSCA, 'ENCONTRADO na lista.');
      console.log('    Data criação (row[0]):', row[0]);
      console.log('    Código (row[1]):', row[1]);
      console.log('    Categoria (row[2]):', row[2]);
      console.log('    Validade (row[4]):', row[4]);
      console.log('    Valor (row[5]):', row[5]);
      console.log('    Saldo (row[6]):', row[6]);
      console.log('    idVoucher (row[10]):', row[10]);
    } else {
      console.log('\n  [API] Código', CODIGO_BUSCA, 'NÃO encontrado na lista retornada pela API.');
      const codigosAmostra = todosVouchers.slice(0, 10).map((r: any) => r[1]).filter(Boolean);
      console.log('  Amostra de códigos (primeiros 10):', codigosAmostra.join(', '));
    }

    // 4. Verificar no banco vm_lav_vouchers
    const conn = await pool.getConnection();
    let noBanco: any[] = [];
    try {
      const rows = await conn.query(
        'SELECT id, user_id, id_voucher_vm, codigo, categoria_nome, data_gerado, valor, saldo, created_at FROM vm_lav_vouchers WHERE user_id = ? AND codigo = ?',
        [userId, CODIGO_BUSCA]
      ) as any[];
      noBanco = Array.isArray(rows) ? rows : [];
    } finally {
      conn.release();
    }

    const encontradoNoBanco = noBanco.length > 0;
    if (encontradoNoBanco) {
      console.log('\n  [BANCO] Código', CODIGO_BUSCA, 'ENCONTRADO em vm_lav_vouchers.');
      noBanco.forEach((r: any, i: number) => {
        console.log('    Registro:', { id: r.id, id_voucher_vm: r.id_voucher_vm, codigo: r.codigo, categoria_nome: r.categoria_nome, data_gerado: r.data_gerado, valor: r.valor, saldo: r.saldo, created_at: r.created_at });
      });
    } else {
      console.log('\n  [BANCO] Código', CODIGO_BUSCA, 'NÃO encontrado em vm_lav_vouchers.');
    }

    // 5. Resumo / análise
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  RESUMO');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  Total vouchers na API (todas as páginas):', todosVouchers.length);
    console.log('  Código', CODIGO_BUSCA, 'na API:', encontradoNaApi ? 'SIM' : 'NÃO');
    console.log('  Código', CODIGO_BUSCA, 'no banco (vm_lav_vouchers):', encontradoNoBanco ? 'SIM' : 'NÃO');
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
}

main();
