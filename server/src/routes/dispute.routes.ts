import { Router } from 'express';
import { createDispute, getDisputes, resolveDispute } from '../controllers/dispute.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

// Any authenticated user can file a dispute
router.post('/', createDispute);

// Supervisors only
router.get('/', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getDisputes);
router.patch('/:id/resolve', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), resolveDispute);

export default router;
