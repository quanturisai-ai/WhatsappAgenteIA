const mariadb = require('mariadb');
require('dotenv').config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'agente_zap',
  connectionLimit: 10,
  allowPublicKeyRetrieval: true,
});

async function testQuery() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    console.log('✅ Conectado ao banco de dados\n');
    
    // Testar a função normaliza_telefone primeiro
    console.log('📞 Testando função normaliza_telefone():');
    console.log('─'.repeat(60));
    
    const testCases = [
      "(64) 99653-7300",
      "(62) 9923-0508",
      "5561981935443",
      "556281025286"
    ];
    
    for (const testCase of testCases) {
      const [result] = await conn.query('SELECT normaliza_telefone(?) as normalized', [testCase]);
      console.log(`  ${testCase.padEnd(20)} → ${result.normalized}`);
    }
    
    console.log('\n');
    
    // Testar a query completa
    console.log('📋 Testando query completa (user_id = 1):');
    console.log('─'.repeat(60));
    
    const query = `
      SELECT 
        c.id, 
        c.contact_number, 
        normaliza_telefone(cl.telefone) as telefone_normalizado,
        normaliza_telefone(c.contact_number) as contact_normalizado,
        CASE 
          WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
            CONCAT(
              SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),
              CASE 
                WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
                THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))
                ELSE ''
              END
            )
          ELSE c.contact_name 
        END as contact_name,
        cl.nome as nome_cliente,
        cl.telefone as telefone_original
      FROM conversations c
      LEFT JOIN vm_lav_clientes cl ON 
        cl.user_id = c.user_id AND
        (
          normaliza_telefone(cl.telefone) = normaliza_telefone(c.contact_number)
        )
      WHERE c.user_id = 1
      ORDER BY c.last_message_at DESC, c.created_at DESC
      LIMIT 10
    `;
    
    const rows = await conn.query(query);
    
    if (rows.length === 0) {
      console.log('  Nenhuma conversa encontrada para user_id = 1');
    } else {
      console.log(`  Encontradas ${rows.length} conversas:\n`);
      rows.forEach((row, index) => {
        console.log(`  ${index + 1}. Conversa ID: ${row.id}`);
        console.log(`     Contact Number: ${row.contact_number}`);
        console.log(`     Contact Normalizado: ${row.contact_normalizado || 'NULL'}`);
        console.log(`     Telefone Original: ${row.telefone_original || 'NULL'}`);
        console.log(`     Telefone Normalizado: ${row.telefone_normalizado || 'NULL'}`);
        console.log(`     Contact Name: ${row.contact_name || 'NULL'}`);
        console.log(`     Nome Cliente: ${row.nome_cliente || 'NULL'}`);
        console.log(`     Match: ${row.telefone_normalizado === row.contact_normalizado ? '✅' : '❌'}`);
        console.log('');
      });
    }
    
    console.log('✅ Teste concluído!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
  } finally {
    if (conn) conn.release();
    await pool.end();
  }
}

testQuery();

