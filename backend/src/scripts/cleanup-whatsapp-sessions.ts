/**
 * Script de limpeza e correção da tabela whatsapp_sessions
 * 
 * Este script:
 * 1. Identifica a sessão mais recente/relevante de cada usuário
 * 2. Remove todas as sessões duplicadas
 * 3. Adiciona constraint UNIQUE para impedir duplicatas futuras
 * 
 * IMPORTANTE: Execute este script com o backend PARADO para evitar conflitos
 */

import pool from '../config/database';

interface SessionToKeep {
  id: number;
  user_id: number;
  status: string;
  last_connected_at: Date | null;
  updated_at: Date;
}

async function cleanup() {
  const conn = await pool.getConnection();
  
  try {
    console.log('='.repeat(80));
    console.log('🧹 LIMPEZA DA TABELA whatsapp_sessions');
    console.log('Data/Hora:', new Date().toLocaleString('pt-BR'));
    console.log('='.repeat(80));
    
    // 1. Contar registros atuais
    const countResult = await conn.query('SELECT COUNT(*) as total FROM whatsapp_sessions') as any;
    const totalBefore = Array.isArray(countResult[0]) ? countResult[0][0].total : countResult[0].total;
    console.log(`\n📊 Total de registros antes da limpeza: ${totalBefore}`);
    
    // 2. Identificar usuários únicos
    const usersResult = await conn.query('SELECT DISTINCT user_id FROM whatsapp_sessions ORDER BY user_id') as any;
    const users = Array.isArray(usersResult[0]) ? usersResult[0] : usersResult;
    console.log(`👥 Usuários encontrados: ${users.length}`);
    
    // 3. Para cada usuário, identificar a sessão que deve ser mantida
    const sessionsToKeep: SessionToKeep[] = [];
    
    for (const user of users) {
      const userId = user.user_id;
      
      // Estratégia: Manter a sessão mais relevante
      // Prioridade:
      // 1. Status 'connected' com last_connected_at mais recente
      // 2. Status 'connected' sem last_connected_at (mas com updated_at mais recente)
      // 3. Qualquer outro status com updated_at mais recente
      
      const bestSessionResult = await conn.query(`
        SELECT id, user_id, status, last_connected_at, updated_at
        FROM whatsapp_sessions
        WHERE user_id = ?
        ORDER BY 
          CASE 
            WHEN status = 'connected' THEN 0 
            WHEN status = 'authenticated' THEN 1
            WHEN status = 'connecting' THEN 2
            ELSE 3 
          END,
          last_connected_at DESC,
          updated_at DESC
        LIMIT 1
      `, [userId]) as any;
      
      const bestSession = Array.isArray(bestSessionResult[0]) ? bestSessionResult[0][0] : bestSessionResult[0];
      
      if (bestSession) {
        sessionsToKeep.push(bestSession);
        console.log(`  ✅ User ${userId}: Mantendo sessão ID=${bestSession.id} (status=${bestSession.status}, last_connected=${bestSession.last_connected_at || 'NULL'})`);
      }
    }
    
    // 4. Deletar todas as sessões que NÃO estão na lista de manter
    const idsToKeep = sessionsToKeep.map(s => s.id);
    
    if (idsToKeep.length === 0) {
      console.log('\n⚠️ Nenhuma sessão para manter. Pulando deleção.');
    } else {
      console.log(`\n🗑️ Deletando sessões duplicadas (mantendo IDs: ${idsToKeep.join(', ')})...`);
      
      const deleteResult = await conn.query(
        `DELETE FROM whatsapp_sessions WHERE id NOT IN (${idsToKeep.map(() => '?').join(',')})`,
        idsToKeep
      ) as any;
      
      const deletedCount = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
      console.log(`  ✅ ${deletedCount} sessões duplicadas removidas`);
    }
    
    // 5. Verificar se ainda existem duplicatas
    const duplicatesCheck = await conn.query(`
      SELECT user_id, COUNT(*) as count 
      FROM whatsapp_sessions 
      GROUP BY user_id 
      HAVING count > 1
    `) as any;
    const duplicates = Array.isArray(duplicatesCheck[0]) ? duplicatesCheck[0] : duplicatesCheck;
    
    if (duplicates.length > 0) {
      console.log('\n⚠️ AVISO: Ainda existem duplicatas após limpeza:');
      for (const d of duplicates) {
        console.log(`  - User ${d.user_id}: ${d.count} registros`);
      }
    } else {
      console.log('\n✅ Nenhuma duplicata restante!');
    }
    
    // 6. Adicionar constraint UNIQUE
    console.log('\n🔒 Adicionando constraint UNIQUE em user_id...');
    
    try {
      // Primeiro verificar se já existe
      const constraintCheck = await conn.query(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.TABLE_CONSTRAINTS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'whatsapp_sessions' 
          AND CONSTRAINT_TYPE = 'UNIQUE'
          AND CONSTRAINT_NAME = 'uk_user_session'
      `) as any;
      
      const existingConstraint = Array.isArray(constraintCheck[0]) ? constraintCheck[0] : constraintCheck;
      
      if (existingConstraint.length > 0) {
        console.log('  ℹ️ Constraint uk_user_session já existe');
      } else {
        await conn.query('ALTER TABLE whatsapp_sessions ADD CONSTRAINT uk_user_session UNIQUE (user_id)');
        console.log('  ✅ Constraint uk_user_session adicionada com sucesso!');
      }
    } catch (error: any) {
      if (error.message.includes('Duplicate entry')) {
        console.log('  ❌ Não foi possível adicionar constraint - ainda existem duplicatas');
        console.log('     Execute a limpeza novamente ou remova manualmente');
      } else if (error.message.includes('Duplicate key name')) {
        console.log('  ℹ️ Constraint já existe');
      } else {
        console.log(`  ❌ Erro ao adicionar constraint: ${error.message}`);
      }
    }
    
    // 7. Atualizar sessões que estão com status inconsistente
    console.log('\n🔧 Corrigindo status inconsistentes...');
    
    // Sessões 'connected' sem last_connected_at devem ter last_connected_at = updated_at
    const fixResult1 = await conn.query(`
      UPDATE whatsapp_sessions 
      SET last_connected_at = updated_at 
      WHERE status = 'connected' AND last_connected_at IS NULL
    `) as any;
    const fixed1 = fixResult1.affectedRows || (Array.isArray(fixResult1) ? fixResult1[0]?.affectedRows : 0);
    if (fixed1 > 0) {
      console.log(`  ✅ ${fixed1} sessão(ões) 'connected' corrigida(s) com last_connected_at`);
    }
    
    // Sessões 'connecting' muito antigas (> 1 hora) devem virar 'disconnected'
    const fixResult2 = await conn.query(`
      UPDATE whatsapp_sessions 
      SET status = 'disconnected', qr_code = NULL
      WHERE status = 'connecting' AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `) as any;
    const fixed2 = fixResult2.affectedRows || (Array.isArray(fixResult2) ? fixResult2[0]?.affectedRows : 0);
    if (fixed2 > 0) {
      console.log(`  ✅ ${fixed2} sessão(ões) 'connecting' antiga(s) corrigida(s) para 'disconnected'`);
    }
    
    // 8. Resumo final
    const countAfterResult = await conn.query('SELECT COUNT(*) as total FROM whatsapp_sessions') as any;
    const totalAfter = Array.isArray(countAfterResult[0]) ? countAfterResult[0][0].total : countAfterResult[0].total;
    
    console.log('\n' + '='.repeat(80));
    console.log('📝 RESUMO DA LIMPEZA:');
    console.log('='.repeat(80));
    console.log(`  Registros antes: ${totalBefore}`);
    console.log(`  Registros depois: ${totalAfter}`);
    console.log(`  Registros removidos: ${totalBefore - totalAfter}`);
    console.log(`  Usuários únicos: ${users.length}`);
    
    // 9. Mostrar estado final
    console.log('\n📋 ESTADO FINAL DA TABELA:');
    const finalResult = await conn.query(`
      SELECT id, user_id, status, 
             DATE_FORMAT(last_connected_at, '%Y-%m-%d %H:%i:%s') as last_connected,
             DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') as updated,
             CASE WHEN qr_code IS NOT NULL AND qr_code != '' THEN 'SIM' ELSE 'NAO' END as tem_qr
      FROM whatsapp_sessions 
      ORDER BY user_id
    `) as any;
    const finalSessions = Array.isArray(finalResult[0]) ? finalResult[0] : finalResult;
    
    for (const s of finalSessions) {
      console.log(`  User ${s.user_id}: ID=${s.id}, Status=${s.status}, LastConn=${s.last_connected || 'NULL'}, QR=${s.tem_qr}`);
    }
    
    console.log('\n✅ Limpeza concluída!');
    
  } catch (error: any) {
    console.error('\n❌ Erro durante limpeza:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

// Executar
cleanup().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});

