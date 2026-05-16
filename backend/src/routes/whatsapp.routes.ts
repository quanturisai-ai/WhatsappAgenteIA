import { Router } from 'express';
import {
  initializeWhatsApp,
  getWhatsAppStatus,
  getQRCode,
  sendMessage,
  disconnectWhatsApp,
  logoutWhatsApp,
} from '../controllers/whatsapp.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.post('/initialize', initializeWhatsApp);
router.get('/status', getWhatsAppStatus);
router.get('/qr', getQRCode);
router.post('/send', sendMessage);
router.post('/disconnect', disconnectWhatsApp);
router.post('/logout', logoutWhatsApp);

export default router;

