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
} from '../controllers/fidelizacao.controller';
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
router.post('/clientes/:cpf/apurar', apurarPremiosCliente);

// Conquistas
router.get('/conquistas', listarConquistas);
router.put('/conquistas/:id/utilizar', marcarPremioUtilizado);

export default router;

