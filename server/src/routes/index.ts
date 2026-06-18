import { Router, type Request, type Response } from 'express';
import authRoutes from './auth.routes.js';
import setupRoutes from './setup.routes.js';
import qrRoutes from './qr.routes.js';
import attendanceRoutes from './attendance.routes.js';
import dashboardRoutes from './dashboard.routes.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.use('/auth', authRoutes);
router.use('/setup', setupRoutes);
router.use('/qr', qrRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
