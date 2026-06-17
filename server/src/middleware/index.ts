import type { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken, type TokenPayload } from '../utils/jwt.js';
import { config } from '../config/env.js';

// Extend Express Request to include authenticated user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Verifies Bearer JWT from Authorization header and attaches decoded payload to req.user.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: 'Access token required' });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * Returns middleware that restricts access to specified roles.
 * Must be used after authenticateToken.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Ensures the authenticated user has a valid organizationId on their token.
 */
export function requireSameOrg(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.organizationId) {
    res.status(403).json({ success: false, error: 'Organization context required' });
    return;
  }

  next();
}

/**
 * Centralized error handler. Logs stack in development only. Never leaks internals.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;

  if (config.isDev) {
    console.error(`[error] ${err.message}\n${err.stack}`);
  } else {
    console.error(`[error] ${err.message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: config.isDev ? err.message : 'Internal server error',
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ success: false, error: 'Resource not found' });
}
