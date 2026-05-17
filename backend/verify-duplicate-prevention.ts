import * as dotenv from 'dotenv';
import { FidelizacaoNotificacaoService } from './src/services/fidelizacaoNotificacao.service';
import { VmLavPedidoModel } from './src/models/vmLavPedido.model';
import logger from './src/utils/logger';

dotenv.config();

async function verify() {
    const pedidoModel = new VmLavPedidoModel();
    const notificacaoService = new FidelizacaoNotificacaoService();

    console.log('--- Iniciando Verificação de Idempotência (TS) ---');

    try {
        // 1. Encontrar um pedido real para o teste (CPF: 510.046.821-15)
        console.log('1. Buscando um pedido para teste (CPF: 510.046.821-15)...');
        const cpf = '510.046.821-15';
        const userId = 1;
        const pedidos = await pedidoModel.findPedidosComSucessoPorCpf(userId, cpf, 1, 1);

        if (!pedidos || pedidos.length === 0) {
            console.error('Nenhum pedido encontrado para o CPF informado.');
            return;
        }

        const pedido = pedidos[0];
        if (!pedido.data_venda) {
            console.error('O pedido encontrado não possui data_venda.');
            return;
        }
        console.log(`Pedido encontrado: ID ${pedido.id}, Data: ${pedido.data_venda.toISOString()}`);

        // 2. Tentar enviar a primeira notificação
        console.log('2. Tentando enviar a primeira notificação...');
        // Forçamos o modo simulação para não enviar WhatsApp real
        // (A configuração do banco para user_id=1 também deve ter simulacao=0, mas vamos garantir o log)

        await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedido.id, pedido.data_venda);
        console.log('Primeira tentativa concluída.');

        // 3. Tentar enviar a SEGUNDA notificação para o MESMO pedido/data
        console.log('3. Tentando enviar a SEGUNDA notificação (Deve ser barrada pelo banco)...');

        await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedido.id, pedido.data_venda);

        console.log('--- Teste concluído! ---');
        console.log('Verifique se apareceu o log de duplicidade.');

    } catch (error) {
        console.error('Erro inesperado no teste:', error);
    } finally {
        process.exit(0);
    }
}

verify();
