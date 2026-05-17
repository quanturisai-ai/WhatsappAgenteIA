import pool from './src/config/database';
import fs from 'fs';

async function saveError() {
    const conn = await pool.getConnection();
    try {
        const [logRow] = await conn.query("SELECT erro FROM vm_lav_sincronizacoes_log WHERE tipo = 'vouchers' ORDER BY id DESC LIMIT 1") as any[];
        if (logRow && logRow.erro) {
            fs.writeFileSync('full-error.txt', logRow.erro);
            console.log('Erro salvo em full-error.txt');
        } else {
            console.log('Nenhum erro encontrado.');
        }
    } catch (err) {
        console.error(err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

saveError();
