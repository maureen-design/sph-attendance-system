import { Router } from 'express';
import {
  getStatus,
  setup,
  createOrganization,
  createDepartments,
  createCohort,
  createCohorts,
  revokeInviteLink,
} from '../controllers/setup.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';
import { Role } from '@prisma/client';

const router = Router();

// Public routes - guarded by org count check
router.get('/status', getStatus);
router.post('/', setup);

// Protected routes - require Super Admin
router.post('/organization', authenticateToken, requireRole(Role.SUPER_ADMIN), createOrganization);
router.post('/departments', authenticateToken, requireRole(Role.SUPER_ADMIN), createDepartments);
router.post('/cohort', authenticateToken, requireRole(Role.SUPER_ADMIN), createCohort);
router.post('/cohorts', authenticateToken, requireRole(Role.SUPER_ADMIN), createCohorts);
router.post('/invite-links/revoke', authenticateToken, requireRole(Role.SUPER_ADMIN), revokeInviteLink);

export default router;
