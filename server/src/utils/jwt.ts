import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config/env.js';

export interface TokenPayload {
  id: string;
  role: Role;
  organizationId: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as TokenPayload;
  return decoded;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenPayload;
  return decoded;
}
