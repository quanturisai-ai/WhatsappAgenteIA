/**
 * Migration: Notification System v2
 * 1. Add simulacao_desativada_em to fidelizacao_config
 * 2. Normalize CPFs in vm_lav_vouchers (11-digit → formatted)
 */
require('dotenv').config();
const mysql = require('mariadb');

async function run() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '3306'),
        allowPublicKeyRetrieval: true,
    });

    console.log('Conectado ao banco. Executando migrations...\n');

    // 1. Add simulacao_desativada_em column
    try {
        await conn.query('ALTER TABLE fidelizacao_config ADD COLUMN simulacao_desativada_em DATETIME NULL DEFAULT NULL');
        console.log('OK: Coluna simulacao_desativada_em adicionada em fidelizacao_config');
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('SKIP: simulacao_desativada_em ja existe');
        } else {
            throw e;
        }
    }

    // 2. Normalize CPFs in vm_lav_vouchers (only pure 11-digit numeric CPFs)
    const normalizeSql = `
    UPDATE vm_lav_vouchers 
    SET cliente_cpf = CONCAT(
      SUBSTRING(cliente_cpf, 1, 3), '.',
      SUBSTRING(cliente_cpf, 4, 3), '.',
      SUBSTRING(cliente_cpf, 7, 3), '-',
      SUBSTRING(cliente_cpf, 10, 2)
    )
    WHERE cliente_cpf REGEXP '^[0-9]{11}$'
  `;
    const res = await conn.query(normalizeSql);
    console.log(`OK: ${res.affectedRows} CPFs normalizados em vm_lav_vouchers`);

    await conn.end();
    console.log('\nMigration concluida com sucesso!');
}

run().catch(e => {
    console.error('ERRO na migration:', e.message);
    process.exit(1);
});
