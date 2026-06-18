import { Router } from 'express';
import {
  createWorkLog,
  getMyWorkLogs,
  getDepartmentWorkLogs,
  addFeedback,
  getMissingWorkLogs,
} from '../controllers/worklog.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

// Attachee only
router.post('/', requireRole('ATTACHEE'), createWorkLog);
router.get('/my', requireRole('ATTACHEE'), getMyWorkLogs);

// Supervisors only
router.get(
  '/department',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  getDepartmentWorkLogs,
);
router.get('/missing', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getMissingWorkLogs);
router.patch('/:id/feedback', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), addFeedback);

export default router;
