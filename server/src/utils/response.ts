import type { Response } from 'express';

export function success<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function error(res: Response, message: string, statusCode = 400): void {
  res.status(statusCode).json({ success: false, error: message });
}
