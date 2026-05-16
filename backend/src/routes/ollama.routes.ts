import { Router } from 'express';
import { listModels, checkHealth } from '../controllers/ollama.controller';

const router = Router();

// Rotas públicas (não requerem autenticação)
router.get('/models', listModels);
router.get('/health', checkHealth);

export default router;

