import { Response, NextFunction } from 'express'
import { verifyAccessToken } from '../utils/jwt'
import { AuthRequest } from '../types'
import { Role } from '@prisma/client'

// Verify JWT token and attach user to request
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Access denied. No token provided.' })
      return
    }

    const token = authHeader.split(' ')[1]
    const decoded = verifyAccessToken(token)
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' })
  }
}

// Authorize specific roles
export const authorize = (...roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated.' })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        message: 'Access denied. You do not have permission to perform this action.',
      })
      return
    }

    next()
  }
}
