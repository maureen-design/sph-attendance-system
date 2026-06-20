import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const QR_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Dedicated secret for QR tokens - access secret + "qr" suffix
const QR_SECRET = config.JWT_ACCESS_SECRET + ':qr';

interface QRPayload {
  locationId: string;
  orgId: string;
  issuedAt: number;
  window: number;
}

/**
 * Generates a signed QR token for a 15-minute window.
 */
export function generateQRToken(locationId: string, orgId: string): string {
  const window = Math.floor(Date.now() / QR_WINDOW_MS);
  return jwt.sign({ locationId, orgId, issuedAt: Date.now(), window } as QRPayload, QR_SECRET, {
    expiresIn: '15m',
  });
}

/**
 * Verifies a QR token. Returns decoded payload or null on failure.
 * Never throws.
 */
export function verifyQRToken(token: string): {
  locationId: string;
  orgId: string;
  window: number;
} | null {
  try {
    const decoded = jwt.verify(token, QR_SECRET) as QRPayload;
    return {
      locationId: decoded.locationId,
      orgId: decoded.orgId,
      window: decoded.window,
    };
  } catch {
    return null;
  }
}

/**
 * Generates the current window's QR token for an organization.
 * Used by the door display endpoint.
 */
export function getCurrentQRToken(orgId: string): string {
  return generateQRToken('door-main', orgId);
}

/**
 * Returns when the current QR window expires (in ISO string).
 */
export function getCurrentWindowExpiry(): string {
  const currentWindow = Math.floor(Date.now() / QR_WINDOW_MS);
  const nextWindowStart = (currentWindow + 1) * QR_WINDOW_MS;
  return new Date(nextWindowStart).toISOString();
}
