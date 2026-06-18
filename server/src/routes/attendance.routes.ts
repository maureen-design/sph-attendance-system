import { Router } from 'express';
import {
  checkIn,
  checkOut,
  selfReportCheckOut,
  getToday,
} from '../controllers/attendance.controller.js';
import { authenticateToken } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

router.post('/checkin', checkIn);
router.post('/checkout', checkOut);
router.post('/checkout/self-report', selfReportCheckOut);
router.get('/today', getToday);

export default router;
