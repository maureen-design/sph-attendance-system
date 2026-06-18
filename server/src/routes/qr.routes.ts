import { Router } from 'express';
import { getCurrentQR } from '../controllers/qr.controller.js';
import { authenticateToken } from '../middleware/index.js';

const router = Router();

router.get('/current', authenticateToken, getCurrentQR);

export default router;
