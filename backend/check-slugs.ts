import pool from './src/config/database';

async function checkSlugs() {
    const conn = await pool.getConnection();
    try {
        console.log('--- Lavanderias e slugs nos pedidos ---');
        const [rows] = await conn.query('SELECT DISTINCT id_lavanderia, lavanderia_descricao, lavanderia_localizador FROM vm_lav_pedidos WHERE user_id = 1') as any[];
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

checkSlugs();
