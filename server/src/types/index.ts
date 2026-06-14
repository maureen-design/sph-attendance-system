import { Request } from 'express'
import { Role } from '@prisma/client'

// Extend Express Request to include authenticated user
export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: Role
    organizationId: string
    departmentId?: string | null
    cohortId?: string | null
  }
}
