import { Router } from 'express';
import {
  createLeave,
  getMyLeaves,
  getPendingLeaves,
  decideLeave,
} from '../controllers/leave.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

router.post('/', createLeave);
router.get('/my', getMyLeaves);
router.get('/pending', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getPendingLeaves);
router.patch('/:id/decide', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), decideLeave);

export default router;
