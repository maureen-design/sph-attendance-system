import { Router } from 'express';
import {
  getSupervisorDashboard,
  getLiveDashboard,
  exportAttendance,
  getPersonalDashboard,
  getSupervisorSummary,
  getAdminReviewItems,
  getEscalatedItems,
} from '../controllers/dashboard.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

// Personal dashboard - any authenticated user
router.get('/personal', getPersonalDashboard);

// Supervisor dashboards - restricted to SUPER_ADMIN and DEPARTMENT_SUPERVISOR
router.get(
  '/supervisor',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  getSupervisorDashboard,
);

router.get(
  '/supervisor/live',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  getLiveDashboard,
);

router.get(
  '/supervisor/export',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  exportAttendance,
);

router.get(
  '/supervisor/summary',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  getSupervisorSummary,
);

// Admin-specific endpoints - restricted to SUPER_ADMIN
router.get(
  '/admin/review',
  requireRole('SUPER_ADMIN'),
  getAdminReviewItems,
);

router.get(
  '/admin/escalated',
  requireRole('SUPER_ADMIN'),
  getEscalatedItems,
);

export default router;
