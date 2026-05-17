import { Router } from 'express';
import {
  configurarCredenciais,
  obterCredenciais,
  testarConexao,
  sincronizarClientes,
  sincronizarVouchers,
  listarClientes,
  fecharNavegador,
} from '../controllers/vmLav.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

// Credenciais
router.post('/credentials', configurarCredenciais);
router.get('/credentials', obterCredenciais);

// Teste e sincronização
router.post('/test-connection', testarConexao);
router.post('/sync', sincronizarClientes);
router.post('/sync-vouchers', sincronizarVouchers);

// Clientes
router.get('/clientes', listarClientes);

// Utilitários
router.post('/close-browser', fecharNavegador);

export default router;

