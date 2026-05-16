import { Router } from 'express';
import {
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
  deleteTopic,
} from '../controllers/topic.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.get('/list', listTopics);
router.get('/:id', getTopic);
router.post('/', createTopic);
router.put('/:id', updateTopic);
router.delete('/:id', deleteTopic);

export default router;

