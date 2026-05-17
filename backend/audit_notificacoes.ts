
import pool from './src/config/database';
import * as fs from 'fs';

async function auditNotifications() {
    const cpf = '321.809.458-50';
    const report: any = { cpf, summary: {}, details: [] };

    try {
        const result = await pool.query(
            `SELECT tipo_notificacao, mensagem_enviada, COUNT(*) as qtd 
       FROM fidelizacao_notificacoes 
       WHERE cpf_cliente = ? 
       GROUP BY tipo_notificacao, mensagem_enviada`,
            [cpf]
        ) as any;

        // Fix BigInt serialization
        const summaryRaw = Array.isArray(result[0]) ? result[0] : result;
        report.summary = summaryRaw.map((row: any) => {
            const newRow = { ...row };
            for (const key in newRow) {
                if (typeof newRow[key] === 'bigint') newRow[key] = newRow[key].toString();
            }
            return newRow;
        });

        const detailsResult = await pool.query(
            `SELECT n.id, n.pedido_id, n.tipo_notificacao, n.mensagem_enviada, n.data_envio, p.data_venda
       FROM fidelizacao_notificacoes n
       LEFT JOIN vm_lav_pedidos p ON n.pedido_id = p.id
       WHERE n.cpf_cliente = ? 
       ORDER BY n.id DESC LIMIT 50`,
            [cpf]
        ) as any;

        const detailsRaw = Array.isArray(detailsResult[0]) ? detailsResult[0] : detailsResult;
        report.details = detailsRaw.map((row: any) => {
            const newRow = { ...row };
            for (const key in newRow) {
                if (typeof newRow[key] === 'bigint') newRow[key] = newRow[key].toString();
            }
            return newRow;
        });

        fs.writeFileSync('audit_notifications.json', JSON.stringify(report, null, 2), 'utf-8');
        console.log('AUDITORIA_GERADA');
    } catch (error: any) {
        console.error('ERRO:', error.message);
    } finally {
        process.exit(0);
    }
}

auditNotifications();
