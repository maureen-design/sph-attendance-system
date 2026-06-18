import { Router } from 'express';
import {
  checkIn,
  checkOut,
  selfReportCheckOut,
  getToday,
  submitExcuse,
  decideExcuse,
  overrideAttendance,
} from '../controllers/attendance.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

router.post('/checkin', checkIn);
router.post('/checkout', checkOut);
router.post('/checkout/self-report', selfReportCheckOut);
router.get('/today', getToday);
router.post('/excuse', submitExcuse);
router.patch('/excuse/:leaveId', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), decideExcuse);
router.patch(
  '/:id/override',
  requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'),
  overrideAttendance,
);

export default router;
