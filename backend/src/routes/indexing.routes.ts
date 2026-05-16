import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  listIndexableContent,
  startIndexing,
  indexContent,
  getIndexingStatus,
} from '../controllers/indexing.controller';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.get('/list', listIndexableContent);
router.get('/status', getIndexingStatus);
router.post('/start', startIndexing);
router.post('/:type/:id', indexContent);

export default router;

