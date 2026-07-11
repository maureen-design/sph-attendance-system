import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyInvite,
  changePassword,
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/index.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticateToken, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-invite', verifyInvite);
router.post('/change-password', authenticateToken, changePassword);

export default router;
