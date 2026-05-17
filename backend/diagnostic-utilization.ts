import { VmLavService } from './src/services/vmLav.service';
import pool from './src/config/database';
import fs from 'fs';

async function diagnose() {
    let log = '';
    const addLog = (msg: string) => {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] ${msg}\n`;
        log += entry;
        console.log(msg);
    };

    const vmLavService = new VmLavService();
    const userId = 1;

    addLog('Iniciando diagnóstico de utilização...');

    try {
        const conn = await pool.getConnection();
        const queryResult = await conn.query('SELECT id, codigo_voucher, utilizado FROM premios_clientes WHERE user_id = ?', [userId]);
        conn.release();

        let premios: any[] = [];
        if (Array.isArray(queryResult)) {
            premios = Array.isArray(queryResult[0]) ? queryResult[0] : queryResult;
        }

        addLog(`Prêmios encontrados no banco: ${premios.length}`);

        for (const p of premios) {
            addLog(`Verificando prêmio ID ${p.id} - Código: ${p.codigo_voucher} - Utilizado: ${p.utilizado}`);

            if (!p.codigo_voucher) {
                addLog('-> Pulo: Sem código de voucher');
                continue;
            }

            const queryResultV = await pool.query('SELECT id, id_voucher_vm, saldo FROM vm_lav_vouchers WHERE codigo = ? AND user_id = ?', [p.codigo_voucher, userId]);
            let vRows: any[] = [];
            if (Array.isArray(queryResultV)) {
                vRows = Array.isArray(queryResultV[0]) ? queryResultV[0] : queryResultV;
            }

            if (vRows.length === 0) {
                addLog(`-> Pulo: Voucher ${p.codigo_voucher} não encontrado na vm_lav_vouchers`);
                continue;
            }

            const v = vRows[0];
            addLog(`-> Voucher local encontrado: ID_VM ${v.id_voucher_vm}, Saldo ${v.saldo}`);

            // Testar API de movimentações
            // @ts-ignore
            const token = await vmLavService.obterTokenValido(userId);
            const movs = await vmLavService.buscarMovimentacoesVoucher(token, v.id_voucher_vm);

            if (!movs.success) {
                addLog(`-> Erro API: ${movs.error}`);
            } else {
                const elementos = movs.elementos || [];
                addLog(`-> API Sucesso: ${elementos.length} movimentações encontradas`);
                elementos.forEach((m: any) => {
                    addLog(`   * [${m.tipoMovimento}] Valor: ${m.valor} Data: ${m.dataMovimentacao}`);
                });
                const retiradas = elementos.filter((m: any) => m.tipoMovimento === 'RETIRADA');
                addLog(`-> Retiradas: ${retiradas.length}`);

                if (retiradas.length > 0) {
                    addLog(`-> Última retirada em: ${retiradas[0].dataMovimentacao}`);
                }
            }
        }

    } catch (err: any) {
        addLog(`ERRO FATAL: ${err.message}`);
    }

    fs.writeFileSync('diagnostic-utilization-result.txt', log);
    addLog('Diagnóstico concluído. Resultado salvo em diagnostic-utilization-result.txt');
    process.exit(0);
}

diagnose();
