import { Router } from 'express';
import {
  getPendingApprovals,
  approveUser,
  rejectUser,
} from '../controllers/approval.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'));

router.get('/pending', getPendingApprovals);
router.post('/:id/approve', approveUser);
router.post('/:id/reject', rejectUser);

export default router;
