/**
 * Script de teste para diagnosticar problemas no scheduler VM Lav
 * 
 * Este script verifica:
 * 1. Se há credenciais ativas no banco
 * 2. Se a query de busca funciona corretamente
 * 3. Se os timers estão sendo criados
 * 4. Se o scheduler está configurado corretamente
 */

import pool from '../config/database';
import { VmLavCredentialsModel } from '../models/vmLavCredentials.model';

async function testScheduler() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TESTE DO SCHEDULER VM LAV');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Testar conexão com banco
    console.log('1️⃣  Testando conexão com banco de dados...');
    const conn = await pool.getConnection();
    console.log('✅ Conexão estabelecida\n');
    conn.release();

    // 2. Verificar estrutura da tabela
    console.log('2️⃣  Verificando estrutura da tabela vm_lav_credentials...');
    const conn2 = await pool.getConnection();
    try {
      const queryResult = await conn2.query(
        `SHOW COLUMNS FROM vm_lav_credentials WHERE Field IN ('ativo', 'status', 'intervalo_sincronizacao_minutos')`
      ) as any;

      let columns: any[] = [];
      if (Array.isArray(queryResult)) {
        columns = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        columns = Array.from(queryResult as any);
      }

      console.log('Colunas encontradas:');
      if (columns.length > 0) {
        columns.forEach((col: any) => {
          console.log(`   - ${col.Field}: ${col.Type} (Default: ${col.Default})`);
        });
      } else {
        console.log('   Nenhuma coluna encontrada');
      }
      console.log('');
    } finally {
      conn2.release();
    }

    // 3. Verificar todos os registros na tabela
    console.log('3️⃣  Verificando todos os registros na tabela vm_lav_credentials...');
    const conn3 = await pool.getConnection();
    try {
      const [allRows] = await conn3.query(
        `SELECT id, user_id, email, ativo, status, intervalo_sincronizacao_minutos, 
         created_at, updated_at 
         FROM vm_lav_credentials 
         ORDER BY id DESC`
      ) as any[];

      let rows: any[] = [];
      if (Array.isArray(allRows)) {
        rows = Array.isArray(allRows[0]) ? allRows[0] : allRows;
      } else if (allRows && typeof allRows === 'object' && 'length' in allRows) {
        rows = Array.from(allRows as any);
      }

      if (rows.length === 0) {
        console.log('⚠️  Nenhum registro encontrado na tabela vm_lav_credentials\n');
      } else {
        console.log(`Encontrados ${rows.length} registro(s):\n`);
        rows.forEach((row: any) => {
          console.log(`   ID: ${row.id}`);
          console.log(`   User ID: ${row.user_id}`);
          console.log(`   Email: ${row.email || 'N/A'}`);
          console.log(`   Ativo: ${row.ativo} (tipo: ${typeof row.ativo})`);
          console.log(`   Status: ${row.status} (tipo: ${typeof row.status})`);
          console.log(`   Intervalo: ${row.intervalo_sincronizacao_minutos || 'NULL'} minutos`);
          console.log(`   Created: ${row.created_at}`);
          console.log(`   Updated: ${row.updated_at}`);
          console.log('');
        });
      }
    } finally {
      conn3.release();
    }

    // 4. Testar query exata do scheduler
    console.log('4️⃣  Testando query exata do scheduler...');
    const conn4 = await pool.getConnection();
    try {
      const queryResult = await conn4.query(
        'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE ativo = 1 AND status = ?',
        ['ativo']
      ) as any;

      // Extrair rows de forma segura (mesmo padrão usado no scheduler)
      let rows: any[] = [];
      if (Array.isArray(queryResult)) {
        rows = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
      } else if (queryResult && typeof queryResult === 'object' && 'length' in queryResult) {
        rows = Array.from(queryResult as any);
      }

      if (rows.length === 0) {
        console.log('⚠️  Query não retornou nenhum resultado\n');
        console.log('   Testando variações da query...\n');

        // Testar variações
        const var1Result = await conn4.query(
          'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE ativo = TRUE AND status = ?',
          ['ativo']
        ) as any;
        let rows1: any[] = [];
        if (Array.isArray(var1Result)) {
          rows1 = Array.isArray(var1Result[0]) ? var1Result[0] : var1Result;
        } else if (var1Result && typeof var1Result === 'object' && 'length' in var1Result) {
          rows1 = Array.from(var1Result as any);
        }
        console.log(`   - ativo = TRUE: ${rows1.length} resultado(s)`);

        const var2Result = await conn4.query(
          'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE ativo = 1 AND status = "ativo"',
          []
        ) as any;
        let rows2: any[] = [];
        if (Array.isArray(var2Result)) {
          rows2 = Array.isArray(var2Result[0]) ? var2Result[0] : var2Result;
        } else if (var2Result && typeof var2Result === 'object' && 'length' in var2Result) {
          rows2 = Array.from(var2Result as any);
        }
        console.log(`   - ativo = 1 (sem parâmetro): ${rows2.length} resultado(s)`);

        const var3Result = await conn4.query(
          'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE ativo = 1',
          []
        ) as any;
        let rows3: any[] = [];
        if (Array.isArray(var3Result)) {
          rows3 = Array.isArray(var3Result[0]) ? var3Result[0] : var3Result;
        } else if (var3Result && typeof var3Result === 'object' && 'length' in var3Result) {
          rows3 = Array.from(var3Result as any);
        }
        console.log(`   - apenas ativo = 1: ${rows3.length} resultado(s)`);

        const var4Result = await conn4.query(
          'SELECT DISTINCT user_id FROM vm_lav_credentials WHERE status = ?',
          ['ativo']
        ) as any;
        let rows4: any[] = [];
        if (Array.isArray(var4Result)) {
          rows4 = Array.isArray(var4Result[0]) ? var4Result[0] : var4Result;
        } else if (var4Result && typeof var4Result === 'object' && 'length' in var4Result) {
          rows4 = Array.from(var4Result as any);
        }
        console.log(`   - apenas status = "ativo": ${rows4.length} resultado(s)\n`);
      } else {
        console.log(`✅ Query retornou ${rows.length} resultado(s):`);
        rows.forEach((row: any) => {
          console.log(`   - user_id: ${row.user_id}`);
        });
        console.log('');
      }
    } finally {
      conn4.release();
    }

    // 5. Testar findByUserId do model
    console.log('5️⃣  Testando findByUserId do VmLavCredentialsModel...');
    const credentialsModel = new VmLavCredentialsModel();
    const credentials = await credentialsModel.findByUserId(1);

    if (!credentials) {
      console.log('⚠️  findByUserId(1) retornou null\n');
    } else {
      console.log('✅ Credenciais encontradas:');
      console.log(`   - ID: ${credentials.id}`);
      console.log(`   - User ID: ${credentials.user_id}`);
      console.log(`   - Email: ${credentials.email || 'N/A'}`);
      console.log(`   - Ativo: ${credentials.ativo} (tipo: ${typeof credentials.ativo})`);
      console.log(`   - Status: ${credentials.status} (tipo: ${typeof credentials.status})`);
      console.log(`   - Intervalo: ${credentials.intervalo_sincronizacao_minutos || 'NULL'} minutos`);
      console.log('');

      // Verificar condições do scheduler
      console.log('   Verificando condições do scheduler:');
      console.log(`   - credentials existe: ${credentials ? 'SIM' : 'NÃO'}`);
      console.log(`   - credentials.ativo: ${credentials.ativo} (${credentials.ativo ? 'PASSA' : 'FALHA'})`);
      console.log(`   - credentials.status === 'ativo': ${credentials.status === 'ativo'} (${credentials.status === 'ativo' ? 'PASSA' : 'FALHA'})`);

      if (!credentials.ativo || credentials.status !== 'ativo') {
        console.log('\n   ⚠️  ATENÇÃO: As credenciais não passam nas verificações do scheduler!');
        console.log('   O timer não será criado para este usuário.\n');
      } else {
        console.log('\n   ✅ Todas as condições estão OK. O timer deveria ser criado.\n');
      }
    }

    // 6. Verificar se o scheduler está sendo importado e chamado
    console.log('6️⃣  Verificando importação do scheduler...');
    try {
      // Tentar importar sem executar (para evitar erros de TypeScript)
      const schedulerModule = await import('../utils/vmLavScheduler');
      if (schedulerModule && schedulerModule.startScheduler) {
        console.log('✅ startScheduler importado com sucesso');
        console.log(`   Tipo: ${typeof schedulerModule.startScheduler}`);
        console.log('');
      } else {
        console.log('⚠️  startScheduler não encontrado no módulo\n');
      }
    } catch (error: any) {
      console.log(`⚠️  Erro ao importar startScheduler: ${error.message}`);
    }

    // 7. Simular criação de timer
    console.log('7️⃣  Simulando criação de timer...');
    if (credentials && credentials.ativo && credentials.status === 'ativo') {
      const intervaloMinutos = credentials.intervalo_sincronizacao_minutos || 10;
      const intervaloMs = intervaloMinutos * 60 * 1000;
      console.log(`   Intervalo configurado: ${intervaloMinutos} minutos`);
      console.log(`   Intervalo em ms: ${intervaloMs}ms`);
      console.log(`   Próxima execução seria em: ${intervaloMinutos} minutos`);
      console.log('');
    } else {
      console.log('   ⚠️  Não é possível simular timer: credenciais não passam nas verificações\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TESTE CONCLUÍDO');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('❌ ERRO durante o teste:');
    console.error(`   Mensagem: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    console.log('');
  } finally {
    // Fechar pool de conexões
    await pool.end();
    process.exit(0);
  }
}

// Executar teste
testScheduler().catch((error) => {
  console.error('Erro fatal:', error);
  process.exit(1);
});

