import { Router } from 'express';
import { testChat, clearTestChat, getTestLogInfo } from '../controllers/testChat.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.post('/', testChat);
router.delete('/', clearTestChat);
router.get('/log-info', getTestLogInfo);

export default router;

