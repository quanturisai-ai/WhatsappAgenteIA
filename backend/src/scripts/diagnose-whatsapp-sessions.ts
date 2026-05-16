/**
 * Script de diagnóstico das sessões WhatsApp
 * Analisa a tabela whatsapp_sessions para identificar problemas
 */

import pool from '../config/database';

async function diagnose() {
  const conn = await pool.getConnection();
  try {
    console.log('='.repeat(80));
    console.log('DIAGNÓSTICO COMPLETO DA TABELA whatsapp_sessions');
    console.log('Data/Hora:', new Date().toLocaleString('pt-BR'));
    console.log('='.repeat(80));
    
    // 1. Todas as sessões
    const allSessionsResult = await conn.query(`
      SELECT 
        id, 
        user_id, 
        status, 
        created_at, 
        updated_at, 
        last_connected_at, 
        last_ready_at, 
        session_files_path, 
        LENGTH(session_data) as session_data_size,
        CASE WHEN qr_code IS NOT NULL AND qr_code != '' THEN 'SIM' ELSE 'NAO' END as tem_qr_code
      FROM whatsapp_sessions 
      ORDER BY user_id, created_at DESC
    `) as any;
    
    const allSessions = Array.isArray(allSessionsResult[0]) ? allSessionsResult[0] : allSessionsResult;
    
    console.log('\n📋 TODOS OS REGISTROS (' + allSessions.length + ' total):');
    console.log('-'.repeat(80));
    
    for (const s of allSessions) {
      const createdAt = s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : 'NULL';
      const updatedAt = s.updated_at ? new Date(s.updated_at).toLocaleString('pt-BR') : 'NULL';
      const lastConn = s.last_connected_at ? new Date(s.last_connected_at).toLocaleString('pt-BR') : 'NULL';
      
      console.log(`ID: ${s.id} | User: ${s.user_id} | Status: ${s.status.padEnd(12)} | Created: ${createdAt} | Updated: ${updatedAt}`);
      console.log(`         | LastConn: ${lastConn} | QR: ${s.tem_qr_code} | SessionData: ${s.session_data_size || 0} bytes | Path: ${s.session_files_path || 'NULL'}`);
      console.log('-'.repeat(80));
    }
    
    // 2. Contagem por status
    console.log('\n📊 CONTAGEM POR STATUS:');
    const statusCountResult = await conn.query('SELECT status, COUNT(*) as count FROM whatsapp_sessions GROUP BY status') as any;
    const statusCount = Array.isArray(statusCountResult[0]) ? statusCountResult[0] : statusCountResult;
    for (const s of statusCount) {
      console.log(`  ${s.status}: ${s.count} registro(s)`);
    }
    
    // 3. Contagem por usuário
    console.log('\n👥 REGISTROS POR USUÁRIO:');
    const userCountResult = await conn.query(`
      SELECT user_id, COUNT(*) as count, GROUP_CONCAT(status SEPARATOR ', ') as statuses 
      FROM whatsapp_sessions 
      GROUP BY user_id 
      ORDER BY user_id
    `) as any;
    const userCount = Array.isArray(userCountResult[0]) ? userCountResult[0] : userCountResult;
    for (const u of userCount) {
      const icon = Number(u.count) > 1 ? '⚠️' : '✅';
      console.log(`  ${icon} User ${u.user_id}: ${u.count} registro(s) - Status: [${u.statuses}]`);
    }
    
    // 4. Sessões duplicadas (mesmo usuário com múltiplos registros)
    console.log('\n⚠️ USUÁRIOS COM MÚLTIPLOS REGISTROS:');
    const duplicatesResult = await conn.query('SELECT user_id, COUNT(*) as count FROM whatsapp_sessions GROUP BY user_id HAVING count > 1') as any;
    const duplicates = Array.isArray(duplicatesResult[0]) ? duplicatesResult[0] : duplicatesResult;
    if (duplicates.length === 0) {
      console.log('  ✅ Nenhum usuário com registros duplicados');
    } else {
      for (const d of duplicates) {
        console.log(`  ❌ User ${d.user_id}: ${d.count} registros (DEVERIA TER APENAS 1!)`);
      }
    }
    
    // 5. Sessões connected duplicadas
    console.log('\n🔴 USUÁRIOS COM MÚLTIPLOS STATUS CONNECTED:');
    const connectedDupsResult = await conn.query(`
      SELECT user_id, COUNT(*) as count 
      FROM whatsapp_sessions 
      WHERE status = 'connected' 
      GROUP BY user_id 
      HAVING count > 1
    `) as any;
    const connectedDups = Array.isArray(connectedDupsResult[0]) ? connectedDupsResult[0] : connectedDupsResult;
    if (connectedDups.length === 0) {
      console.log('  ✅ Nenhum usuário com múltiplos connected');
    } else {
      for (const d of connectedDups) {
        console.log(`  ❌ User ${d.user_id}: ${d.count} registros connected (CRÍTICO! CAUSA DESCONEXÃO)`);
      }
    }
    
    // 6. Análise de idade das sessões
    console.log('\n⏰ ANÁLISE DE IDADE DAS SESSÕES:');
    const ageAnalysisResult = await conn.query(`
      SELECT 
        id,
        user_id,
        status,
        TIMESTAMPDIFF(HOUR, last_connected_at, NOW()) as hours_since_last_conn,
        TIMESTAMPDIFF(HOUR, updated_at, NOW()) as hours_since_update,
        last_connected_at,
        updated_at
      FROM whatsapp_sessions
      ORDER BY user_id
    `) as any;
    const ageAnalysis = Array.isArray(ageAnalysisResult[0]) ? ageAnalysisResult[0] : ageAnalysisResult;
    for (const s of ageAnalysis) {
      const lastConnHours = s.hours_since_last_conn !== null ? `${s.hours_since_last_conn}h` : 'NEVER';
      const updatedHours = s.hours_since_update !== null ? `${s.hours_since_update}h` : 'NEVER';
      const warning = (s.hours_since_last_conn === null || s.hours_since_last_conn > 168) ? '⚠️' : '✅';
      console.log(`  ${warning} User ${s.user_id} (ID ${s.id}): Última conexão há ${lastConnHours} | Atualizado há ${updatedHours} | Status: ${s.status}`);
    }
    
    // 7. Verificar se há sessões com status inconsistente
    console.log('\n🔍 ANÁLISE DE CONSISTÊNCIA:');
    
    // 7.1 Sessões 'connected' mas sem last_connected_at
    const inconsistent1Result = await conn.query(`
      SELECT id, user_id, status, last_connected_at 
      FROM whatsapp_sessions 
      WHERE status = 'connected' AND last_connected_at IS NULL
    `) as any;
    const inconsistent1 = Array.isArray(inconsistent1Result[0]) ? inconsistent1Result[0] : inconsistent1Result;
    if (inconsistent1.length > 0) {
      console.log(`  ❌ Sessões 'connected' sem last_connected_at: ${inconsistent1.length}`);
      for (const s of inconsistent1) {
        console.log(`     - User ${s.user_id} (ID ${s.id})`);
      }
    } else {
      console.log('  ✅ Todas sessões connected têm last_connected_at');
    }
    
    // 7.2 Sessões 'connected' com last_connected_at muito antiga (> 7 dias)
    const inconsistent2Result = await conn.query(`
      SELECT id, user_id, status, last_connected_at, TIMESTAMPDIFF(DAY, last_connected_at, NOW()) as days_ago
      FROM whatsapp_sessions 
      WHERE status = 'connected' AND TIMESTAMPDIFF(DAY, last_connected_at, NOW()) > 7
    `) as any;
    const inconsistent2 = Array.isArray(inconsistent2Result[0]) ? inconsistent2Result[0] : inconsistent2Result;
    if (inconsistent2.length > 0) {
      console.log(`  ⚠️ Sessões 'connected' com última conexão há mais de 7 dias: ${inconsistent2.length}`);
      for (const s of inconsistent2) {
        console.log(`     - User ${s.user_id} (ID ${s.id}): ${s.days_ago} dias atrás`);
      }
    } else {
      console.log('  ✅ Todas sessões connected têm última conexão recente');
    }
    
    // 8. Resumo final
    console.log('\n' + '='.repeat(80));
    console.log('📝 RESUMO DO DIAGNÓSTICO:');
    console.log('='.repeat(80));
    console.log(`  Total de registros: ${allSessions.length}`);
    console.log(`  Usuários únicos: ${userCount.length}`);
    console.log(`  Usuários com duplicatas: ${duplicates.length}`);
    console.log(`  Usuários com múltiplos 'connected': ${connectedDups.length}`);
    
    console.log('\n✅ Diagnóstico concluído!');
    
  } finally {
    conn.release();
    await pool.end();
  }
}

diagnose().catch(err => {
  console.error('Erro no diagnóstico:', err);
  process.exit(1);
});

