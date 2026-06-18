import type { Request, Response, NextFunction } from 'express';
import { getCurrentQRToken, getCurrentWindowExpiry } from '../utils/qr.js';
import * as respond from '../utils/response.js';

/**
 * GET /api/qr/current — returns current QR token for the user's org.
 */
export function getCurrentQR(req: Request, res: Response, next: NextFunction): void {
  try {
    const orgId = req.user!.organizationId;
    const token = getCurrentQRToken(orgId);
    const expiresAt = getCurrentWindowExpiry();

    respond.success(res, {
      token,
      expiresAt,
      windowMinutes: 15,
    });
  } catch (err) {
    next(err);
  }
}
