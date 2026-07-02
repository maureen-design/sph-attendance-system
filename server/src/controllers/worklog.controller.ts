import { Role } from '@prisma/client';
import { format, eachDayOfInterval, isWeekend, startOfMonth, endOfMonth, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// --- Type aliases -----------------------------------------------------------

type WorkLogRow = {
  id: string;
  userId: string;
  organizationId: string;
  date: Date;
  summary: string;
  progress: string;
  blockers: string | null;
  needsHelp: boolean;
  supervisorNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AttacheeRow = { id: string; fullName: string; departmentId: string | null };

// --- ENDPOINT 1: POST /api/worklogs -----------------------------------------

export async function createWorkLog(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const {
      date: dateStr,
      summary,
      progress,
      blockers,
      needsHelp,
      flagNote,
    } = req.body as {
      date?: string;
      summary?: string;
      progress?: string;
      blockers?: string;
      needsHelp?: boolean;
      flagNote?: string;
    };

    if (!summary || !progress) {
      respond.error(res, 'summary and progress are required', 400);
      return;
    }

    // Determine date (default: today in org timezone)
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const targetDateStr = dateStr ?? format(toZonedTime(new Date(), orgTimezone), 'yyyy-MM-dd');
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

    // Check for existing log
    const existing = await prisma.workLog.findUnique({
      where: { userId_date: { userId, date: targetDate } },
    });
    if (existing) {
      respond.error(res, 'Work log already exists for this date', 409);
      return;
    }

    // Create work log
    const workLog = await prisma.workLog.create({
      data: {
        userId,
        organizationId,
        date: targetDate,
        summary,
        progress,
        blockers: blockers ?? null,
        needsHelp: needsHelp ?? false,
        supervisorNote: flagNote ?? null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'WORKLOG_CREATED',
        tableName: 'WorkLog',
        recordId: workLog.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { workLog }, 201);
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 2: GET /api/worklogs/my ---------------------------------------

export async function getMyWorkLogs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const monthStr = (req.query.month as string) ?? format(new Date(), 'yyyy-MM');
    const monthDate = parse(monthStr, 'yyyy-MM', new Date());
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    // Get user's work logs for the month
    const logs = (await prisma.workLog.findMany({
      where: {
        userId,
        date: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { date: 'desc' },
    })) as WorkLogRow[];

    // Calculate working days in month (exclude weekends)
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const workingDays = allDays.filter((d: Date) => !isWeekend(d));
    const logDateSet = new Set(logs.map((l: WorkLogRow) => format(l.date, 'yyyy-MM-dd')));
    const missingDays = workingDays
      .map((d: Date) => format(d, 'yyyy-MM-dd'))
      .filter((d: string) => !logDateSet.has(d));

    respond.success(res, { logs, missingDays });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 3: GET /api/worklogs/department -------------------------------

export async function getDepartmentWorkLogs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const {
      departmentId: queryDeptId,
      date: dateStr,
      cohortId,
      userId: filterUserId,
    } = req.query as {
      departmentId?: string;
      date?: string;
      cohortId?: string;
      userId?: string;
    };

    // Scope for DEPARTMENT_SUPERVISOR
    let scopedDeptId = queryDeptId;
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      scopedDeptId = user?.departmentId ?? undefined;
    }

    // Determine date
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const targetDateStr = dateStr ?? format(toZonedTime(new Date(), orgTimezone), 'yyyy-MM-dd');
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

    // Build user filter
    const userWhere: Record<string, unknown> = {
      organizationId,
      status: 'ACTIVE',
      role: Role.ATTACHEE,
    };
    if (scopedDeptId) userWhere.departmentId = scopedDeptId;
    if (cohortId) userWhere.cohortId = cohortId;
    if (filterUserId) userWhere.id = filterUserId;

    const attachees = (await prisma.user.findMany({
      where: userWhere,
      select: { id: true, fullName: true, departmentId: true },
    })) as AttacheeRow[];

    // Fetch work logs for target date
    const userIds = attachees.map((a: AttacheeRow) => a.id);
    const logs =
      userIds.length > 0
        ? ((await prisma.workLog.findMany({
            where: { userId: { in: userIds }, date: targetDate },
          })) as WorkLogRow[])
        : [];

    const logMap = new Map(logs.map((l: WorkLogRow) => [l.userId, l]));

    respond.success(res, {
      logs: attachees.map((a: AttacheeRow) => ({
        user: { id: a.id, fullName: a.fullName },
        log: logMap.get(a.id) ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 4: PATCH /api/worklogs/:id/feedback ---------------------------

export async function addFeedback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const workLogId = req.params.id as string;

    const { note } = req.body as { note?: string };
    if (!note) {
      respond.error(res, 'note is required', 400);
      return;
    }

    const workLog = await prisma.workLog.findUnique({
      where: { id: workLogId },
    });

    if (!workLog) {
      respond.error(res, 'Work log not found', 404);
      return;
    }

    // Validate supervisor has access to this user's department
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const supervisor = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });

      const logUser = await prisma.user.findUnique({
        where: { id: workLog.userId },
        select: { departmentId: true },
      });

      if (supervisor?.departmentId !== logUser?.departmentId) {
        respond.error(res, 'Access denied', 403);
        return;
      }
    }

    const updated = await prisma.workLog.update({
      where: { id: workLogId },
      data: { supervisorNote: note },
    });

    respond.success(res, { workLog: updated });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 5: GET /api/worklogs/missing ----------------------------------

export async function getMissingWorkLogs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user!.role;
    const supervisorId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // Determine target date
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const targetDateStr =
      (req.query.date as string) ?? format(toZonedTime(new Date(), orgTimezone), 'yyyy-MM-dd');
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

    // Scope for DEPARTMENT_SUPERVISOR
    let scopedDeptId: string | undefined;
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const user = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { departmentId: true },
      });
      scopedDeptId = user?.departmentId ?? undefined;
    }

    // Get all active attachees
    const userWhere: Record<string, unknown> = {
      organizationId,
      status: 'ACTIVE',
      role: Role.ATTACHEE,
    };
    if (scopedDeptId) userWhere.departmentId = scopedDeptId;

    const attachees = (await prisma.user.findMany({
      where: userWhere,
      select: { id: true, fullName: true, departmentId: true },
    })) as AttacheeRow[];

    // Find which attachees have a work log for the date
    const userIds = attachees.map((a: AttacheeRow) => a.id);
    const existingLogs =
      userIds.length > 0
        ? ((await prisma.workLog.findMany({
            where: { userId: { in: userIds }, date: targetDate },
            select: { userId: true },
          })) as { userId: string }[])
        : [];

    const hasLogSet = new Set(existingLogs.map((l: { userId: string }) => l.userId));
    const missing = attachees
      .filter((a: AttacheeRow) => !hasLogSet.has(a.id))
      .map((a: AttacheeRow) => ({
        user: { id: a.id, fullName: a.fullName },
        departmentId: a.departmentId,
      }));

    respond.success(res, { missing });
  } catch (err) {
    next(err);
  }
}
