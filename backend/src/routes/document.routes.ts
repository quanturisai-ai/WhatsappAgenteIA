import { Router } from 'express';
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  getUploadMiddleware,
} from '../controllers/document.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.post('/upload', getUploadMiddleware(), uploadDocument);
router.get('/list', listDocuments);
router.delete('/:id', deleteDocument);

export default router;

