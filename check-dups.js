const pool = require('./backend/src/config/database').default;

async function check() {
    const conn = await pool.getConnection();
    try {
        const version = await conn.query('SELECT VERSION()');
        console.log('Database version:', version[0]['VERSION()']);

        console.log('Checking for duplicates in vm_lav_pedidos...');
        const dups = await conn.query(`
      SELECT user_id, data_venda, cliente_cpf, valor, COUNT(*) as count 
      FROM vm_lav_pedidos 
      GROUP BY user_id, data_venda, cliente_cpf, valor 
      HAVING COUNT(*) > 1
    `);
        console.log('Duplicates found:', dups.length);
        if (dups.length > 0) {
            console.log('First 5 dups:', dups.slice(0, 5));
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

check();
