import { Router } from 'express';
import {
  getInvites,
  createInvite,
  revokeInvite,
  getCohortsForInvite,
  getDepartmentsForInvite,
} from '../controllers/invite.controller.js';
import { authenticateToken, requireRole } from '../middleware/index.js';

const router = Router();

router.use(authenticateToken);
router.use(requireRole('SUPER_ADMIN'));

router.get('/', getInvites);
router.get('/cohorts', getCohortsForInvite);
router.get('/departments', getDepartmentsForInvite);
router.post('/', createInvite);
router.patch('/:id/revoke', revokeInvite);

export default router;
