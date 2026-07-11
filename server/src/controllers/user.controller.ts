import { Role } from '@prisma/client';
import { subDays } from 'date-fns';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// --- Type aliases -----------------------------------------------------------

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  organizationId: string;
  departmentId: string | null;
  cohortId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type AttendanceRow = {
  id: string;
  date: Date;
  status: string;
  checkInTime: Date | null;
  checkOutTime: Date | null;
};

// --- ENDPOINT 1: GET /api/users ---------------------------------------------

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userRole = req.user!.role;
    const supervisorId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const {
      departmentId: queryDeptId,
      role,
      cohortId,
      search,
      isActive,
    } = req.query as {
      departmentId?: string;
      role?: string;
      cohortId?: string;
      search?: string;
      isActive?: string;
    };

    // Scope DEPARTMENT_SUPERVISOR to own department
    let scopedDeptId = queryDeptId;
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { departmentId: true },
      });
      scopedDeptId = sup?.departmentId ?? undefined;
    }

    // Build where
    const where: Record<string, unknown> = { organizationId };
    if (scopedDeptId) where.departmentId = scopedDeptId;
    if (role) where.role = role;
    if (cohortId) where.cohortId = cohortId;
    if (isActive === 'true') where.status = 'ACTIVE';
    if (isActive === 'false') where.status = 'INACTIVE';
    if (search) {
      where.fullName = { contains: search, mode: 'insensitive' };
    }

    const users = (await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        organizationId: true,
        departmentId: true,
        cohortId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { fullName: 'asc' },
    })) as UserRow[];

    const total = await prisma.user.count({ where });

    respond.success(res, { users, total });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 2: GET /api/users/:id -----------------------------------------

export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetId = req.params.id as string;
    const supervisorId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        organizationId: true,
        departmentId: true,
        cohortId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      respond.error(res, 'User not found', 404);
      return;
    }

    if (user.organizationId !== organizationId) {
      respond.error(res, 'Access denied', 403);
      return;
    }

    // DEPARTMENT_SUPERVISOR can only view own department
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { departmentId: true },
      });
      if (user.departmentId !== sup?.departmentId) {
        respond.error(res, 'Access denied', 403);
        return;
      }
    }

    // Recent attendance (last 30 days)
    const thirtyDaysAgo = subDays(new Date(), 30);
    const recentAttendance = (await prisma.attendanceLog.findMany({
      where: { userId: targetId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, status: true, checkInTime: true, checkOutTime: true },
    })) as AttendanceRow[];

    respond.success(res, { user, recentAttendance });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 3: PATCH /api/users/:id/role ----------------------------------

export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const targetId = req.params.id as string;

    if (targetId === actorId) {
      respond.error(res, 'Cannot change your own role', 400);
      return;
    }

    const { role, departmentId } = req.body as {
      role?: string;
      departmentId?: string;
    };

    if (!role) {
      respond.error(res, 'role is required', 400);
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target || target.organizationId !== organizationId) {
      respond.error(res, 'User not found', 404);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        role: role as Role,
        ...(departmentId !== undefined && { departmentId: departmentId || null }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        departmentId: true,
        status: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'USER_ROLE_CHANGED',
        tableName: 'User',
        recordId: targetId,
        reason: `Role changed to ${role}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { user: updated });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 4: PATCH /api/users/:id/deactivate ----------------------------

export async function deactivateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const targetId = req.params.id as string;

    if (targetId === actorId) {
      respond.error(res, 'Cannot deactivate your own account', 400);
      return;
    }

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target || target.organizationId !== organizationId) {
      respond.error(res, 'User not found', 404);
      return;
    }

    await prisma.user.update({
      where: { id: targetId },
      data: { status: 'INACTIVE' },
    });

    // Revoke all refresh tokens
    await prisma.refreshToken.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'USER_DEACTIVATED',
        tableName: 'User',
        recordId: targetId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 5: PATCH /api/users/:id/reactivate ----------------------------

export async function reactivateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const actorId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const targetId = req.params.id as string;

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target || target.organizationId !== organizationId) {
      respond.error(res, 'User not found', 404);
      return;
    }

    await prisma.user.update({
      where: { id: targetId },
      data: { status: 'ACTIVE' },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'USER_REACTIVATED',
        tableName: 'User',
        recordId: targetId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'User reactivated' });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 6: GET /api/users/:id/attendance ------------------------------

export async function getUserAttendance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const targetId = req.params.id as string;
    const supervisorId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const { startDate: startDateStr, endDate: endDateStr } = req.query as {
      startDate?: string;
      endDate?: string;
    };

    // Verify target user
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, fullName: true, organizationId: true, departmentId: true },
    });

    if (!target || target.organizationId !== organizationId) {
      respond.error(res, 'User not found', 404);
      return;
    }

    // DEPARTMENT_SUPERVISOR scope check
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { departmentId: true },
      });
      if (target.departmentId !== sup?.departmentId) {
        respond.error(res, 'Access denied', 403);
        return;
      }
    }

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (startDateStr) dateFilter.gte = new Date(startDateStr + 'T00:00:00.000Z');
    if (endDateStr) dateFilter.lte = new Date(endDateStr + 'T00:00:00.000Z');

    const logs = (await prisma.attendanceLog.findMany({
      where: {
        userId: targetId,
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        status: true,
        checkInTime: true,
        checkOutTime: true,
        checkInMethod: true,
        checkOutMethod: true,
        overriddenBy: true,
        overrideReason: true,
      },
    })) as AttendanceRow[];

    respond.success(res, {
      user: { id: target.id, fullName: target.fullName },
      logs,
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 7: GET /api/user/profile --------------------------------------

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        institution: true,
        role: true,
        departmentId: true,
        cohortId: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      respond.error(res, 'User not found', 404);
      return;
    }

    // Resolve department and cohort names
    const [department, cohort] = await Promise.all([
      user.departmentId
        ? prisma.department.findUnique({ where: { id: user.departmentId }, select: { name: true } })
        : null,
      user.cohortId
        ? prisma.cohort.findUnique({ where: { id: user.cohortId }, select: { name: true } })
        : null,
    ]);

    respond.success(res, {
      ...user,
      department: department ?? null,
      cohort: cohort ?? null,
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 8: PATCH /api/user/profile/phone ------------------------------

export async function updatePhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const { phone } = req.body as { phone?: string };

    if (phone === undefined || phone === null) {
      respond.error(res, 'phone is required', 400);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { phone },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        departmentId: true,
        cohortId: true,
        institution: true,
        status: true,
        createdAt: true,
      },
    });

    // Resolve department and cohort names (same shape as getProfile)
    const [department, cohort] = await Promise.all([
      updated.departmentId
        ? prisma.department.findUnique({
            where: { id: updated.departmentId },
            select: { name: true },
          })
        : null,
      updated.cohortId
        ? prisma.cohort.findUnique({ where: { id: updated.cohortId }, select: { name: true } })
        : null,
    ]);

    respond.success(res, {
      user: { ...updated, department: department ?? null, cohort: cohort ?? null },
    });
  } catch (err) {
    next(err);
  }
}
