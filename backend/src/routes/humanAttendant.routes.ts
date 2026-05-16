import { Router } from 'express';
import {
  getAttendants,
  createAttendant,
  updateAttendant,
  deleteAttendant,
  sendTestMessage,
  getAlertsByConversation,
  resolveIntervention,
} from '../controllers/humanAttendant.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.get('/', getAttendants);
router.post('/', createAttendant);
router.put('/:id', updateAttendant);
router.delete('/:id', deleteAttendant);
router.post('/test', sendTestMessage);
router.get('/alerts/conversation/:id', getAlertsByConversation);
router.post('/conversation/:id/resolve', resolveIntervention);

export default router;

