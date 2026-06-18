import { Router } from 'express';
import {
  createAnnouncement,
  getAnnouncements,
  markAnnouncementRead,
  acknowledgeAnnouncement,
  getReceipts,
  archiveAnnouncement,
} from '../controllers/announcement.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);

// Any authenticated user
router.get('/', getAnnouncements);
router.patch('/:id/read', markAnnouncementRead);
router.patch('/:id/acknowledge', acknowledgeAnnouncement);

// Supervisors only
router.post('/', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), createAnnouncement);

router.get('/:id/receipts', requireRole('SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'), getReceipts);

// Super admin only
router.delete('/:id', requireRole('SUPER_ADMIN'), archiveAnnouncement);

export default router;
