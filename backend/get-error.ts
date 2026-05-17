import pool from './src/config/database';

async function getFullError() {
    const conn = await pool.getConnection();
    try {
        const [logRow] = await conn.query("SELECT erro FROM vm_lav_sincronizacoes_log WHERE tipo = 'vouchers' ORDER BY id DESC LIMIT 1") as any[];
        if (logRow && logRow.erro) {
            console.log('ERRO COMPLETO:', logRow.erro);
        } else {
            console.log('Nenhum erro encontrado no ultimo log.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

getFullError();
