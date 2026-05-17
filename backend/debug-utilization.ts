
import { FidelizacaoService } from './src/services/fidelizacao.service';
import dotenv from 'dotenv';
import moment from 'moment';

dotenv.config();

const mariadb = require('mariadb');
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function debugUtilization() {
    const userId = 1;
    const cpf = '703.557.531-62';

    console.log(`--- Debugging Utilization for CPF: ${cpf} ---`);

    const conn = await pool.getConnection();
    try {
        // 1. Fetch Active Prize Start Dates (Data Minima Logic)
        const activePrizes = await conn.query('SELECT * FROM premios WHERE user_id = ? AND ativo = 1', [userId]);
        console.log(`Active Prizes: ${activePrizes.length}`);
        let dataMinima = new Date(0);
        if (activePrizes.length > 0) {
            const startDates = activePrizes
                .filter((p: any) => p.data_inicio_utilizacoes)
                .map((p: any) => new Date(p.data_inicio_utilizacoes).getTime());
            if (startDates.length > 0) {
                dataMinima = new Date(Math.min(...startDates));
            }
        }
        console.log(`Data Minima calculated: ${dataMinima.toISOString()}`);

        // 2. Fetch Orders
        const queryPedidos = `
            SELECT id, data_venda, tipo_servico, valor, pago_com_fidelidade, situacao_venda
            FROM vm_lav_pedidos 
            WHERE user_id = ? AND cliente_id IN (SELECT id FROM vm_lav_clientes WHERE cpf = ?)
            AND situacao_venda = 'Sucesso'
            AND data_venda >= ?
            ORDER BY data_venda ASC
        `;
        const pedidos = await conn.query(queryPedidos, [userId, cpf, dataMinima]);
        console.log(`Transactions Found (after Data Minima): ${pedidos.length}`);

        // 3. Fetch Conquests
        const queryConquistas = `
            SELECT pc.id, pc.premio_id, pc.data_conquista, pr.objetivo, pr.servico as tipo_servico_premio, pr.descricao
            FROM premios_clientes pc
            JOIN premios pr ON pc.premio_id = pr.id
            WHERE pc.cpf_cliente = ? AND pc.user_id = ?
            ORDER BY pc.data_conquista ASC
        `;
        const conquistas = await conn.query(queryConquistas, [cpf, userId]);
        console.log(`Conquests Found: ${conquistas.length}`);

        // 4. Simulate Matching Logic
        let pedidosMap = pedidos.map((p: any) => ({ ...p, contabilizado: false }));

        for (const conquista of conquistas) {
            console.log(`\n==================================================`);
            console.log(`Processing Conquest ID: ${conquista.id} (${conquista.descricao})`);
            console.log(`Target: ${conquista.objetivo}, Type: ${conquista.tipo_servico_premio}`);
            console.log(`Conquest Date: ${new Date(conquista.data_conquista).toISOString()}`);

            let consumidos = 0;
            const dataConquista = new Date(conquista.data_conquista);
            // Add 1 day to include orders on the same day
            const dataLimite = new Date(dataConquista);
            dataLimite.setDate(dataLimite.getDate() + 1);

            for (const pedido of pedidosMap) {
                if (consumidos >= conquista.objetivo) break;
                if (pedido.contabilizado) continue;
                if (pedido.pago_com_fidelidade) {
                    // console.log(`  - Skipping Order ${pedido.id}: Paid with Loyalty`);
                    continue;
                }

                // Compatibility Check
                // Normalize types to avoid case mismatches
                const conquistaTipo = conquista.tipo_servico_premio ? conquista.tipo_servico_premio.toUpperCase() : 'TOTAL';
                const pedidoTipo = pedido.tipo_servico ? pedido.tipo_servico.toUpperCase() : '';

                const isCompatible = conquistaTipo === 'TOTAL' || pedidoTipo === conquistaTipo;
                const pedidoDate = new Date(pedido.data_venda);
                const isTimeValid = pedidoDate < dataLimite;

                if (isCompatible && isTimeValid) {
                    pedido.contabilizado = true;
                    consumidos++;
                    console.log(`  ✅ [MARKED] Order ${pedido.id} (${pedido.tipo_servico}) - Date: ${pedidoDate.toISOString()} `);
                } else {
                    if (!isCompatible) console.log(`  - Skip Order ${pedido.id} (${pedido.tipo_servico}): Incompatible Type (Need ${conquistaTipo})`);
                    if (!isTimeValid) console.log(`  - Skip Order ${pedido.id} (${pedidoDate.toISOString()}): After Conquest Date`);
                }
            }
            console.log(`Result: Consumed ${consumidos}/${conquista.objetivo} orders.`);
        }

        // 5. Final Report
        const unusedOrders = pedidosMap.filter((p: any) => !p.contabilizado && !p.pago_com_fidelidade);
        console.log(`\n--- Final Report ---`);
        console.log(`Total Orders: ${pedidos.length}`);
        console.log(`Loyalty Paid: ${pedidosMap.filter((p: any) => p.pago_com_fidelidade).length}`);
        console.log(`Used: ${pedidosMap.filter((p: any) => p.contabilizado).length}`);
        console.log(`Free/Available: ${unusedOrders.length}`);

    } catch (e) {
        console.error(e);
    } finally {
        conn.release();
        process.exit(0);
    }
}

debugUtilization();
