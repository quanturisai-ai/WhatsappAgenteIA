import { Router } from 'express';
import { getAgentConfig, updateAgentConfig } from '../controllers/agentConfig.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.get('/', getAgentConfig);
router.put('/', updateAgentConfig);
router.post('/', updateAgentConfig); // POST também aceito para compatibilidade

export default router;

