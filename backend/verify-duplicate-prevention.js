const mariadb = require('mariadb');
const dotenv = require('dotenv');
const { FidelizacaoNotificacaoService } = require('./src/services/fidelizacaoNotificacao.service');
const { VmLavPedidoModel } = require('./src/models/vmLavPedido.model');
const logger = require('./src/utils/logger');

dotenv.config();

async function verify() {
    const pedidoModel = new VmLavPedidoModel();
    const notificacaoService = new FidelizacaoNotificacaoService();

    console.log('--- Iniciando Verificação de Idempotência ---');

    try {
        // 1. Encontrar um pedido real para o teste (CPF: 510.046.821-15)
        console.log('1. Buscando um pedido para teste (CPF: 510.046.821-15)...');
        const cpf = '510.046.821-15';
        const userId = 1;
        const pedidos = await pedidoModel.findPedidosComSucessoPorCpf(userId, cpf, 0, 1);

        if (!pedidos || pedidos.length === 0) {
            console.error('Nenhum pedido encontrado para o CPF informado.');
            return;
        }

        const pedido = pedidos[0];
        console.log(`Pedido encontrado: ID ${pedido.id}, Data: ${pedido.data_venda.toISOString()}`);

        // 2. Tentar enviar a primeira notificação (deve funcionar ou já existir)
        console.log('2. Tentando enviar a primeira notificação (ou verificar duplicidade)...');
        // Forçamos o modo simulação para não enviar WhatsApp real
        process.env.SIMULACAO = 'true';

        await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedido.id, pedido.data_venda);
        console.log('Primeira tentativa concluída (veja logs acima para detalhes).');

        // 3. Tentar enviar a SEGUNDA notificação para o MESMO pedido/data
        console.log('3. Tentando enviar a SEGUNDA notificação (Deve ser barrada pelo banco)...');

        // Vamos capturar o log para ver se a mensagem de duplicidade aparece
        // Como o service agora tem um try/catch que loga "ignorada por duplicidade", 
        // se o script terminar sem erro e o log aparecer, o teste passou.

        await notificacaoService.enviarNotificacaoProgressoPorPedido(userId, cpf, pedido.id, pedido.data_venda);

        console.log('--- Teste concluído! ---');
        console.log('Verifique os logs: deve aparecer uma mensagem de "ignorada por duplicidade".');

    } catch (error) {
        console.error('Erro inesperado no teste:', error);
    } finally {
        process.exit(0);
    }
}

verify();
