import { Router } from 'express';
import {
  getUsers,
  getUserById,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  getUserAttendance,
} from '../controllers/user.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

// Any supervisor
router.get('/', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getUsers);
router.get('/:id', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getUserById);
router.get(
  '/:id/attendance',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  getUserAttendance,
);

// Super admin only
router.patch('/:id/role', requireRole('SUPER_ADMIN'), updateUserRole);
router.patch('/:id/deactivate', requireRole('SUPER_ADMIN'), deactivateUser);
router.patch('/:id/reactivate', requireRole('SUPER_ADMIN'), reactivateUser);

export default router;
