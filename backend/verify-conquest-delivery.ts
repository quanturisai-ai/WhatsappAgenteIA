import * as dotenv from 'dotenv';
import { FidelizacaoNotificacaoService } from './src/services/fidelizacaoNotificacao.service';
import { VmLavPedidoModel } from './src/models/vmLavPedido.model';
import { PremioClienteModel } from './src/models/premioCliente.model';
import logger from './src/utils/logger';

dotenv.config();

async function verify() {
    const pedidoModel = new VmLavPedidoModel();
    const premioClienteModel = new PremioClienteModel();
    const notificacaoService = new FidelizacaoNotificacaoService();

    console.log('--- Verificação de Conquista e Entrega ---');

    try {
        const cpf = '510.046.821-15';
        const userId = 1;

        // 1. Testar Notificação de Conquista (Simulada via Scheduler-like call)
        console.log('\n1. Testando Conquista (via Scheduler-like call)...');
        const pedidos = await pedidoModel.findPedidosComSucessoPorCpf(userId, cpf, 1, 1);
        if (pedidos && pedidos.length > 0) {
            const pedido = pedidos[0];
            const premiosFake = [{ id: 999, premio_id: 1 }] as any; // Mock de prêmio concedido

            console.log(`Usando Pedido ${pedido.id} e Data ${pedido.data_venda?.toISOString()}`);
            await notificacaoService.enviarNotificacaoConquistaPorPedido(userId, cpf, pedido.id, pedido.data_venda!, premiosFake);
            console.log('Envio de Conquista (Simulado) processado.');
        }

        // 2. Testar Notificação de Entrega (Manual)
        console.log('\n2. Testando Entrega de Voucher (Manual)...');
        // Buscar um voucher existente para esse cliente
        const vouchers = await premioClienteModel.findByCpf(userId, cpf);
        if (vouchers && vouchers.length > 0) {
            const voucher = vouchers[0];
            console.log(`Usando Voucher ID ${voucher.id} (Prêmio ${voucher.premio_id})`);

            try {
                await notificacaoService.enviarNotificacaoEntregaPremio(userId, voucher.id);
                console.log('Envio de Entrega (Simulado) processado.');
            } catch (e: any) {
                console.warn('Nota: Pode falhar se o WhatsApp não estiver pronto, mas o foco é o salvamento no banco:', e.message);
            }
        } else {
            console.warn('Nenhum voucher encontrado para teste de entrega.');
        }

        console.log('\n--- Fim da Verificação ---');

    } catch (error) {
        console.error('Erro inesperado no teste:', error);
    } finally {
        process.exit(0);
    }
}

verify();
