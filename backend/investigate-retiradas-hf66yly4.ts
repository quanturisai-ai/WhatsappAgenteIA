/**
 * Script temporário: buscar retiradas do voucher HF66YLY4 (id_voucher_vm 221757)
 * e comparar datas/serial com os pedidos 7256 e 7257.
 * Não altera nada.
 */
import dotenv from 'dotenv';
dotenv.config();

import { VmLavService } from './src/services/vmLav.service';

const ID_VOUCHER_VM = 221757; // HF66YLY4
const USER_ID = 1;
const PEDIDOS_REF = [
  { id: 7256, data_venda: '2026-02-20T10:29:09.000Z', equipamento_numero_serie: 'B827EB144A16', valor: 16.95 },
  { id: 7257, data_venda: '2026-02-20T10:29:09.000Z', equipamento_numero_serie: 'B827EB144A16', valor: 16.95 },
];

function parseDateApi(s: string): Date {
  const endsWithZ = s.endsWith('Z');
  return new Date(endsWithZ ? s : s + 'Z');
}

function diffMinutes(d1: Date, d2: Date): number {
  return Math.round((d1.getTime() - d2.getTime()) / (60 * 1000));
}

async function main() {
  const vmLavService = new VmLavService();
  console.log('Obtendo token para user_id', USER_ID, '...');
  const token = await vmLavService.obterTokenValido(USER_ID);
  if (!token) {
    console.error('Token inválido ou indisponível. Execute o fluxo de login VM-Lav antes.');
    process.exit(1);
  }
  console.log('Token obtido.\n');

  console.log('Buscando movimentações do voucher', ID_VOUCHER_VM, '(HF66YLY4)...');
  const movResult = await vmLavService.buscarMovimentacoesVoucher(token, ID_VOUCHER_VM);
  if (!movResult.success || !movResult.elementos) {
    console.error('Falha ao buscar movimentações:', movResult.error);
    process.exit(1);
  }

  const retiradas = movResult.elementos.filter((m: any) => m.tipoMovimento === 'RETIRADA');
  console.log('Total de movimentações:', movResult.elementos.length);
  console.log('Retiradas (RETIRADA):', retiradas.length, '\n');

  const pedidoRefDate = new Date(PEDIDOS_REF[0].data_venda);

  for (let i = 0; i < retiradas.length; i++) {
    const r = retiradas[i];
    const dataRetirada = parseDateApi(r.dataMovimentacao);
    const valorRetirada = Math.abs(parseFloat(r.valor || 0));
    const maquinaProp = r.transacaoConta?.propriedades?.find((p: any) =>
      p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
    );
    const serialMaquina = maquinaProp?.propriedade?.numeroSerie || maquinaProp?.propriedade?.descricao || null;
    const localProp = r.transacaoConta?.propriedades?.find((p: any) => p.classe?.nome === 'LAVANDERIA');
    const localNome = localProp?.propriedade?.descricao || null;

    const diffMin = diffMinutes(pedidoRefDate, dataRetirada);
    const dentroDe5Min = Math.abs(diffMin) <= 5;
    const serialIgual = serialMaquina && String(serialMaquina).trim() === PEDIDOS_REF[0].equipamento_numero_serie;

    console.log('--- Retirada', i + 1, '---');
    console.log('  dataMovimentacao (API):', r.dataMovimentacao);
    console.log('  dataRetirada (Date):', dataRetirada.toISOString());
    console.log('  valor:', r.valor, '=> valorRetirada:', valorRetirada);
    console.log('  serial máquina:', serialMaquina ?? '(não encontrado)');
    console.log('  local:', localNome ?? '(não encontrado)');
    console.log('  Pedido 7256 data_venda:', PEDIDOS_REF[0].data_venda);
    console.log('  Diferença (min) pedido - retirada:', diffMin, dentroDe5Min ? '(DENTRO de 5 min)' : '(FORA de 5 min)');
    console.log('  Serial igual ao pedido (B827EB144A16)?', serialIgual ? 'SIM' : 'NÃO');
    console.log('  valor_sem_desconto (16.95) >= valorRetirada?', 16.95 >= valorRetirada);
    console.log('');
  }

  console.log('=== Resumo para match do 2º UPDATE ===');
  console.log('Condições: user_id, CPF, equipamento_numero_serie, valor_sem_desconto >= valorRetirada, ABS(diff) <= 5 min, pago_com_fidelidade=0');
  console.log('Pedidos 7256/7257: data_venda = 2026-02-20 10:29:09 UTC, equipamento = B827EB144A16, valor_sem_desconto = 16.95\n');
  const algumaDentro = retiradas.some((r: any) => {
    const dataRetirada = parseDateApi(r.dataMovimentacao);
    const diffMin = diffMinutes(pedidoRefDate, dataRetirada);
    const maquinaProp = r.transacaoConta?.propriedades?.find((p: any) =>
      p.classe?.nome === 'EQUIPAMENTO' || p.propriedade?.tipo?.nome === 'EQUIPAMENTO'
    );
    const serial = maquinaProp?.propriedade?.numeroSerie || maquinaProp?.propriedade?.descricao;
    const serialOk = serial && String(serial).trim() === 'B827EB144A16';
    return Math.abs(diffMin) <= 5 && serialOk;
  });
  console.log('Alguma retirada com diff <= 5 min E serial B827EB144A16?', algumaDentro ? 'SIM' : 'NÃO');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
