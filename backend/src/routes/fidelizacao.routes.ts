import { Router } from 'express';
import {
  listarPremios,
  criarPremio,
  atualizarPremio,
  deletarPremio,
  listarClientesFidelidade,
  obterFidelizacaoPorCpf,
  obterDistribuicaoPorPercentual,
  apurarPremiosCliente,
  marcarPremioUtilizado,
  listarConquistas,
  obterPedidosDetalhados,
  registrarEntregaPremio,
  gerarVoucherConquista,
  listarNotificacoes,
  getConfigFidelizacao,
  atualizarSimulacao,
  reenviarNotificacao,
} from '../controllers/fidelizacao.controller';
import {
  listarTiposGatilho,
  getConfig as getAutomacoesConfig,
  updateConfig as updateAutomacoesConfig,
  listarRegras,
  getRegra,
  criarRegra,
  updateRegra,
  deleteRegra,
  toggleRegra,
  previewRegraById,
  previewRegraByBody,
} from '../controllers/fidelizacaoRegras.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

// Prêmios
router.get('/premios', listarPremios);
router.post('/premios', criarPremio);
router.put('/premios/:id', atualizarPremio);
router.delete('/premios/:id', deletarPremio);

// Clientes
router.get('/clientes', listarClientesFidelidade);
router.get('/clientes/distribuicao', obterDistribuicaoPorPercentual); // Rota específica antes da rota com parâmetro
router.get('/clientes/:cpf', obterFidelizacaoPorCpf);
router.get('/clientes/:cpf/pedidos', obterPedidosDetalhados);
router.post('/clientes/:cpf/apurar', apurarPremiosCliente);

// Conquistas
router.get('/conquistas', listarConquistas);
router.put('/conquistas/:id/utilizar', marcarPremioUtilizado);
router.put('/conquistas/:id/entrega', registrarEntregaPremio);
router.put('/conquistas/:id/gerar-voucher', gerarVoucherConquista);

// Notificações (lista enviadas) e config (simulação)
router.get('/notificacoes', listarNotificacoes);
router.post('/notificacoes/:id/reenviar', reenviarNotificacao);
router.get('/config', getConfigFidelizacao);
router.patch('/config/simulacao', atualizarSimulacao);

// Automações (regras parametrizáveis)
router.get('/automacoes/tipos', listarTiposGatilho);
router.get('/automacoes/config', getAutomacoesConfig);
router.put('/automacoes/config', updateAutomacoesConfig);
router.get('/automacoes/regras', listarRegras);
router.post('/automacoes/regras/preview', previewRegraByBody);
router.get('/automacoes/regras/:id', getRegra);
router.post('/automacoes/regras', criarRegra);
router.put('/automacoes/regras/:id', updateRegra);
router.delete('/automacoes/regras/:id', deleteRegra);
router.patch('/automacoes/regras/:id/toggle', toggleRegra);
router.post('/automacoes/regras/:id/preview', previewRegraById);

export default router;

