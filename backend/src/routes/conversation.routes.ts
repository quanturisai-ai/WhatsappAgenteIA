import { Router } from 'express';
import {
  listConversations,
  getConversation,
  pauseAutoResponding,
  resumeAutoResponding,
  pauseAllConversations,
  resumeAllConversations,
  takeOverConversation,
  finishConversation,
  markIntervention,
  sendMessage,
  sendMedia,
  createConversation,
} from '../controllers/conversation.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.post('/:id/pause', pauseAutoResponding);
router.post('/:id/resume', resumeAutoResponding);
router.post('/:id/takeover', takeOverConversation);
router.post('/:id/finish', finishConversation);
router.post('/:id/mark-intervention', markIntervention);
router.post('/pause-all', pauseAllConversations);
router.post('/resume-all', resumeAllConversations);
router.post('/send', sendMessage);
router.post('/send-media', sendMedia);

export default router;

