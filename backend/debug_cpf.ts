
import pool from './src/config/database';
import * as fs from 'fs';

async function checkCpfHistory() {
    const cpf = '321.809.458-50';
    const report: any = { cpf, debug_time: new Date().toISOString(), pedidos: [], notificacoes: [] };

    try {
        const pedidosResult = await pool.query(
            'SELECT id, data_venda, id_maquina, valor, pago_com_fidelidade, created_at FROM vm_lav_pedidos WHERE cliente_cpf = ? ORDER BY data_venda DESC LIMIT 10',
            [cpf]
        ) as any;
        report.pedidos = Array.isArray(pedidosResult[0]) ? pedidosResult[0] : pedidosResult;

        const notificacoesResult = await pool.query(
            'SELECT id, pedido_id, tipo_notificacao, mensagem_enviada, data_envio, enviado_whatsapp FROM fidelizacao_notificacoes WHERE cpf_cliente = ? ORDER BY data_envio DESC LIMIT 10',
            [cpf]
        ) as any;
        report.notificacoes = Array.isArray(notificacoesResult[0]) ? notificacoesResult[0] : notificacoesResult;

        fs.writeFileSync('debug_report.json', JSON.stringify(report, null, 2), 'utf-8');
        console.log('RELATORIO_GERADO');
    } catch (error: any) {
        console.error('ERRO:', error.message);
    } finally {
        process.exit(0);
    }
}

checkCpfHistory();
