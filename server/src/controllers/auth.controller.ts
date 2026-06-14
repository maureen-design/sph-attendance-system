import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../utils/prisma'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { AuthRequest } from '../types'

// ─────────────────────────────────────────
// REGISTER via invite link
// ─────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, phone, password, departmentId, inviteCode } = req.body

    // Validate required fields
    if (!fullName || !email || !password || !inviteCode) {
      res.status(400).json({ message: 'Full name, email, password and invite code are required.' })
      return
    }

    // Validate invite code and get cohort
    const cohort = await prisma.cohort.findUnique({
      where: { inviteCode },
      include: { organization: true },
    })

    if (!cohort) {
      res.status(400).json({ message: 'Invalid invite code.' })
      return
    }

    if (!cohort.isActive) {
      res.status(400).json({ message: 'This invite link is no longer active.' })
      return
    }

    if (cohort.inviteExpiry && new Date() > cohort.inviteExpiry) {
      res.status(400).json({ message: 'This invite link has expired.' })
      return
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      res.status(400).json({ message: 'An account with this email already exists.' })
      return
    }

    // Validate department belongs to the organization
    if (departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: cohort.organizationId },
      })
      if (!department) {
        res.status(400).json({ message: 'Invalid department.' })
        return
      }
    }

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Generate email verification token
    const verifyToken = crypto.randomBytes(32).toString('hex')

    // Create user
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone: phone || null,
        passwordHash,
        role: 'ATTACHEE',
        organizationId: cohort.organizationId,
        departmentId: departmentId || null,
        cohortId: cohort.id,
        verifyToken,
        isVerified: false,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        organizationId: true,
        departmentId: true,
        cohortId: true,
        isVerified: true,
        createdAt: true,
      },
    })

    // TODO: Send verification email with verifyToken
    // For now, auto-verify in development
    if (process.env.NODE_ENV === 'development') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true, verifyToken: null },
      })
    }

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      user,
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ 
      message: 'Something went wrong. Please try again.',
      error: process.env.NODE_ENV === 'development' ? (error as any)?.message : undefined,
      code: process.env.NODE_ENV === 'development' ? (error as any)?.code : undefined,
      meta: process.env.NODE_ENV === 'development' ? (error as any)?.meta : undefined,
    })
  }
}

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required.' })
      return
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        department: { select: { name: true } },
        cohort: { select: { name: true } },
        organization: { select: { name: true, shortName: true } },
      },
    })

    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' })
      return
    }

    if (!user.isActive) {
      res.status(401).json({ message: 'Your account has been deactivated. Contact your administrator.' })
      return
    }

    if (!user.isVerified) {
      res.status(401).json({ message: 'Please verify your email before logging in.' })
      return
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash)
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid email or password.' })
      return
    }

    // Generate tokens
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      cohortId: user.cohortId,
    }

    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'USER_LOGIN',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    })

    res.status(200).json({
      message: 'Login successful.',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        organization: user.organization,
        department: user.department,
        cohort: user.cohort,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'Something went wrong. Please try again.' })
  }
}

// ─────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken: token } = req.body

    if (!token) {
      res.status(400).json({ message: 'Refresh token is required.' })
      return
    }

    const decoded = verifyRefreshToken(token)

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    })

    if (!user || !user.isActive) {
      res.status(401).json({ message: 'Invalid refresh token.' })
      return
    }

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      departmentId: user.departmentId,
      cohortId: user.cohortId,
    }

    const newAccessToken = generateAccessToken(tokenPayload)

    res.status(200).json({ accessToken: newAccessToken })
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token.' })
  }
}

// ─────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body

    if (!email) {
      res.status(400).json({ message: 'Email is required.' })
      return
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // Always return success to prevent email enumeration
    if (!user) {
      res.status(200).json({ message: 'If an account exists with that email, a reset link has been sent.' })
      return
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    })

    // TODO: Send password reset email
    console.log(`Password reset token for ${email}: ${resetToken}`)

    res.status(200).json({ message: 'If an account exists with that email, a reset link has been sent.' })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ message: 'Something went wrong. Please try again.' })
  }
}

// ─────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      res.status(400).json({ message: 'Token and new password are required.' })
      return
    }

    if (password.length < 8) {
      res.status(400).json({ message: 'Password must be at least 8 characters.' })
      return
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired reset token.' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    })

    res.status(200).json({ message: 'Password reset successfully. You can now log in.' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ message: 'Something went wrong. Please try again.' })
  }
}

// ─────────────────────────────────────────
// GET CURRENT USER (me)
// ─────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isVerified: true,
        createdAt: true,
        organization: { select: { name: true, shortName: true, logoUrl: true } },
        department: { select: { id: true, name: true } },
        cohort: { select: { id: true, name: true, startDate: true, endDate: true } },
      },
    })

    if (!user) {
      res.status(404).json({ message: 'User not found.' })
      return
    }

    res.status(200).json({ user })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ message: 'Something went wrong.' })
  }
}
