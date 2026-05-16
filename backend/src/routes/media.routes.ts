import { Router } from 'express';
import {
  uploadMedia,
  listMedias,
  updateMedia,
  deleteMedia,
  getMediaFile,
  getUploadMiddleware,
} from '../controllers/media.controller';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Todas as rotas exigem autenticação
router.use(authenticateToken);

router.post('/upload', getUploadMiddleware(), uploadMedia);
router.get('/list', listMedias);
router.get('/:id/file', getMediaFile);
router.put('/:id', updateMedia);
router.delete('/:id', deleteMedia);

export default router;

