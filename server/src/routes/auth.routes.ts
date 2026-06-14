import { Router } from 'express'
import {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword,
  getMe,
} from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth.middleware'

const router = Router()

// Public routes
router.post('/register', register)
router.post('/login', login)
router.post('/refresh', refreshToken)
router.post('/forgot-password', forgotPassword)
router.post('/reset-password', resetPassword)

// Protected routes
router.get('/me', authenticate, getMe)

export default router
