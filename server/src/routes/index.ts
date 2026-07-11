import { Router, type Request, type Response } from 'express';
import authRoutes from './auth.routes.js';
import setupRoutes from './setup.routes.js';
import qrRoutes from './qr.routes.js';
import attendanceRoutes from './attendance.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import notificationRoutes from './notification.routes.js';
import announcementRoutes from './announcement.routes.js';
import worklogRoutes from './worklog.routes.js';
import userRoutes from './user.routes.js';
import disputeRoutes from './dispute.routes.js';
import approvalRoutes from './approval.routes.js';
import inviteRoutes from './invite.routes.js';

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
router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/worklogs', worklogRoutes);
router.use('/users', userRoutes);
router.use('/disputes', disputeRoutes);
router.use('/approvals', approvalRoutes);
router.use('/invites', inviteRoutes);

export default router;
