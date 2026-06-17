import { Router } from 'express';
import {
  getStatus,
  setup,
  createDepartments,
  createCohort,
} from '../controllers/setup.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';
import { Role } from '@prisma/client';

const router = Router();

// Public routes — guarded by org count check
router.get('/status', getStatus);
router.post('/', setup);

// Protected routes — require Super Admin
router.post('/departments', authenticateToken, requireRole(Role.SUPER_ADMIN), createDepartments);
router.post('/cohort', authenticateToken, requireRole(Role.SUPER_ADMIN), createCohort);

export default router;
