import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { hashPassword, comparePassword } from '../utils/hash.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '../utils/jwt.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../utils/email.js';
import { config } from '../config/env.js';
import * as respond from '../utils/response.js';

// --- Validation helpers -----------------------------------------------------

function validateRegister(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!body.fullName || typeof body.fullName !== 'string') errors.push('fullName is required');
  if (!body.email || typeof body.email !== 'string') errors.push('email is required');
  if (!body.password || typeof body.password !== 'string') errors.push('password is required');
  if (!body.inviteToken || typeof body.inviteToken !== 'string')
    errors.push('inviteToken is required');
  return errors;
}

function validateLogin(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!body.email || typeof body.email !== 'string') errors.push('email is required');
  if (!body.password || typeof body.password !== 'string') errors.push('password is required');
  if (!body.orgShortName || typeof body.orgShortName !== 'string')
    errors.push('orgShortName is required');
  return errors;
}

// --- POST /api/auth/register ------------------------------------------------

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fieldErrors = validateRegister(req.body as Record<string, unknown>);
    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const { fullName, email, phone, password, inviteToken } = req.body as {
      fullName: string;
      email: string;
      phone?: string;
      password: string;
      inviteToken: string;
    };

    // 1) Find invite link with cohort
    const invite = await prisma.inviteLink.findUnique({
      where: { token: inviteToken },
      include: { cohort: true, department: true },
    });

    if (!invite) {
      respond.error(res, 'Invalid invite link', 400);
      return;
    }

    // 2) Validate invite link
    if (!invite.isActive) {
      respond.error(res, 'This invite link has been revoked', 400);
      return;
    }
    if (invite.revokedAt !== null) {
      respond.error(res, 'This invite link has been revoked', 400);
      return;
    }
    if (invite.expiresAt < new Date()) {
      respond.error(res, 'This invite link has expired', 400);
      return;
    }
    if (invite.usedCount >= invite.maxUses) {
      respond.error(res, 'This invite link has reached its usage limit', 400);
      return;
    }

    const organizationId = invite.cohort.organizationId;

    // 3) Check existing user
    const existing = await prisma.user.findUnique({
      where: { email_organizationId: { email, organizationId } },
    });

    if (existing) {
      respond.error(res, 'An account with this email already exists in this organization', 400);
      return;
    }

    // 4) Hash password & create user
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone: phone ?? null,
        passwordHash,
        role: 'ATTACHEE',
        organizationId,
        cohortId: invite.cohortId,
        departmentId: invite.departmentId ?? null,
      },
    });

    // 5) Check for duplicate registration attempt (same user trying to use link again)
    if (invite.usedBy && invite.usedBy.includes(user.id)) {
      // Log duplicate attempt
      await prisma.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: 'INVITE_LINK_DUPLICATE_ATTEMPT',
          tableName: 'InviteLink',
          recordId: invite.id,
          reason: 'User attempted to register with an invite link they already used',
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });

      respond.error(res, 'You have already used this invite link', 400);
      return;
    }

    // 6) Increment invite usage and track user
    await prisma.inviteLink.update({
      where: { id: invite.id },
      data: {
        usedCount: { increment: 1 },
        usedBy: { push: user.id },
      },
    });

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: user.id,
        action: 'USER_REGISTERED',
        tableName: 'User',
        recordId: user.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    // 7) Send welcome email (failure won't affect response)
    try {
      await sendWelcomeEmail(user.email, user.fullName, `${config.CLIENT_URL}/login`);
    } catch (emailErr) {
      console.error('[register] Failed to send welcome email:', (emailErr as Error).message);
    }

    // 8) Response
    respond.success(
      res,
      {
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
        message: 'Registration successful. Please log in.',
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

// --- POST /api/auth/login ---------------------------------------------------

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const fieldErrors = validateLogin(req.body as Record<string, unknown>);
    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const { email, password, orgShortName } = req.body as {
      email: string;
      password: string;
      orgShortName: string;
    };

    // 1) Look up organization by short name
    const org = await prisma.organization.findFirst({
      where: { shortName: { equals: orgShortName, mode: 'insensitive' } },
    });

    if (!org) {
      respond.error(res, 'Invalid credentials', 401);
      return;
    }

    // 2) Find user
    const user = await prisma.user.findUnique({
      where: { email_organizationId: { email, organizationId: org.id } },
    });

    if (!user) {
      respond.error(res, 'Invalid credentials', 401);
      return;
    }

    // 2) Check active
    if (!user.isActive) {
      respond.error(res, 'Account deactivated', 401);
      return;
    }

    // 3) Verify password
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      respond.error(res, 'Invalid credentials', 401);
      return;
    }

    // 4) Manage refresh token limit - revoke oldest if >= 2 active
    const activeTokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (activeTokens.length >= 2) {
      await prisma.refreshToken.update({
        where: { id: activeTokens[0].id },
        data: { revokedAt: new Date() },
      });
    }

    // 5) Sign tokens
    const payload: TokenPayload = {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
    };

    const accessToken = signAccessToken(payload);
    const refreshTokenRaw = signRefreshToken(payload);

    // 6) Store hashed refresh token
    const refreshTokenHash = await hashPassword(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenHash,
        deviceInfo: req.headers['user-agent'] ?? null,
        expiresAt,
      },
    });

    // 7) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: 'USER_LOGIN',
        tableName: 'User',
        recordId: user.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    // 8) Response
    respond.success(res, {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        departmentId: user.departmentId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/auth/refresh -------------------------------------------------

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken || typeof refreshToken !== 'string') {
      respond.error(res, 'refreshToken is required', 400);
      return;
    }

    // 1) Verify JWT signature
    let payload: TokenPayload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      respond.error(res, 'Invalid or expired refresh token', 401);
      return;
    }

    // 2) Find matching active tokens for this user
    const storedTokens = await prisma.refreshToken.findMany({
      where: { userId: payload.id, revokedAt: null },
    });

    if (storedTokens.length === 0) {
      respond.error(res, 'Invalid or expired refresh token', 401);
      return;
    }

    // 3) Compare submitted token against stored hashes
    let matched = false;
    for (const stored of storedTokens) {
      const isValid = await comparePassword(refreshToken, stored.token);
      if (isValid) {
        // 4) Check expiry
        if (stored.expiresAt < new Date()) {
          respond.error(res, 'Invalid or expired refresh token', 401);
          return;
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      respond.error(res, 'Invalid or expired refresh token', 401);
      return;
    }

    // 5) Sign new access token
    const newAccessToken = signAccessToken({
      id: payload.id,
      role: payload.role,
      organizationId: payload.organizationId,
    });

    respond.success(res, { accessToken: newAccessToken });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/auth/logout --------------------------------------------------

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };

    if (!refreshToken || typeof refreshToken !== 'string') {
      respond.error(res, 'refreshToken is required', 400);
      return;
    }

    const userId = req.user!.id;

    // 1) Find matching token
    const storedTokens = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });

    for (const stored of storedTokens) {
      const isValid = await comparePassword(refreshToken, stored.token);
      if (isValid) {
        // 2) Revoke
        await prisma.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
    }

    // 3) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: req.user!.organizationId,
        actorId: userId,
        action: 'USER_LOGOUT',
        tableName: 'User',
        recordId: userId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/auth/forgot-password -----------------------------------------

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, organizationId } = req.body as {
      email?: string;
      organizationId?: string;
    };

    if (!email || !organizationId) {
      respond.error(res, 'email and organizationId are required', 400);
      return;
    }

    const genericMessage = 'If an account exists, a reset link has been sent';

    // 1) Find user
    const user = await prisma.user.findUnique({
      where: { email_organizationId: { email, organizationId } },
    });

    if (!user) {
      respond.success(res, { message: genericMessage });
      return;
    }

    // 2) Generate reset token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await hashPassword(rawToken);
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // 3) Store in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpiry },
    });

    // 4) Build reset link
    const resetLink = `${config.CLIENT_URL}/reset-password?token=${rawToken}&userId=${user.id}`;

    // 5) Send email (failure won't crash)
    await sendPasswordResetEmail(user.email, user.fullName, resetLink);

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        tableName: 'User',
        recordId: user.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: genericMessage });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/auth/reset-password ------------------------------------------

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, token, newPassword } = req.body as {
      userId?: string;
      token?: string;
      newPassword?: string;
    };

    if (!userId || !token || !newPassword) {
      respond.error(res, 'userId, token, and newPassword are required', 400);
      return;
    }

    // 1) Find user
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      respond.error(res, 'Invalid or expired reset link', 400);
      return;
    }

    // 2) Check DB fields
    if (!user.resetToken || !user.resetTokenExpiry) {
      respond.error(res, 'Invalid or expired reset link', 400);
      return;
    }

    // 3) Check expiry
    if (user.resetTokenExpiry < new Date()) {
      await prisma.user.update({
        where: { id: userId },
        data: { resetToken: null, resetTokenExpiry: null },
      });
      respond.error(res, 'Reset link has expired', 400);
      return;
    }

    // 4) Compare token against stored hash
    const valid = await comparePassword(token, user.resetToken);
    if (!valid) {
      respond.error(res, 'Invalid or expired reset link', 400);
      return;
    }

    // 5) Hash new password
    const newHash = await hashPassword(newPassword);

    // 6) Update user: password + clear reset fields
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // 7) Revoke all active refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 8) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: userId,
        action: 'PASSWORD_RESET',
        tableName: 'User',
        recordId: userId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'Password reset successful. Please log in.' });
  } catch (err) {
    next(err);
  }
}
