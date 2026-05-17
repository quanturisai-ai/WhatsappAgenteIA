/**
 * Script: testa geração de voucher via API VM
 * Cliente fixo: DIEGO VINICIUS PORTILHO COSTA, CPF 00707251109
 *
 * Uso: npm run test:gerar-voucher [userId]
 * Ex.: npm run test:gerar-voucher 1
 */

import 'dotenv/config';
import { VmLavService } from '../services/vmLav.service';

const NOME_CLIENTE = 'DIEGO VINICIUS PORTILHO COSTA';
const CPF_CLIENTE = '00707251109';

async function main() {
  const userId = parseInt(process.argv[2] || '1', 10);
  const vmLavService = new VmLavService();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  Test: Geração de voucher via API VM');
  console.log('  user_id =', userId);
  console.log('  Cliente:', NOME_CLIENTE);
  console.log('  CPF:', CPF_CLIENTE);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Buscar itens-restricao (dados do cliente)
    console.log('1. Buscando itens-restricao para cliente...');
    const resItens = await vmLavService.buscarItensRestricaoCliente(userId, NOME_CLIENTE);
    if (!resItens.success) {
      console.error('Erro:', resItens.error);
      process.exit(1);
    }
    console.log('   idRestricao:', resItens.idRestricao);
    console.log('   descricao:', resItens.descricao);
    console.log('');

    // 2. Criar voucher (Lavagem, 1 uso, R$ 16,95, validade 34 dias)
    const dataInicio = new Date();
    dataInicio.setHours(3, 0, 0, 0);
    const dataTermino = new Date(dataInicio);
    dataTermino.setDate(dataTermino.getDate() + 34);

    console.log('2. Criando voucher (Lavagem, 1 uso, R$ 16,95)...');
    const resCriar = await vmLavService.criarVoucherFidelidade(userId, {
      idRestricao: resItens.idRestricao!,
      descricaoCliente: resItens.descricao!,
      valor: '16.95',
      quantidadeUtilizacoes: 1,
      dataInicio,
      dataTermino,
      servico: 'LAVAGEM',
    });

    if (!resCriar.success) {
      console.error('Erro:', resCriar.error);
      process.exit(1);
    }
    console.log('   idVoucher:', resCriar.idVoucher);
    console.log('');

    // 3. Obter código do voucher
    console.log('3. Obtendo código do voucher...');
    const resCodigo = await vmLavService.obterCodigoVoucher(userId, resCriar.idVoucher!);
    if (!resCodigo.success) {
      console.error('Erro:', resCodigo.error);
      process.exit(1);
    }
    console.log('   codigo:', resCodigo.codigo);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  Sucesso! Voucher gerado.');
    console.log('  Código:', resCodigo.codigo);
    console.log('  Validade:', dataTermino.toLocaleDateString('pt-BR'));
    console.log('═══════════════════════════════════════════════════════════════════\n');
  } catch (error: any) {
    console.error('Erro:', error.message);
    process.exit(1);
  }
}

main();
