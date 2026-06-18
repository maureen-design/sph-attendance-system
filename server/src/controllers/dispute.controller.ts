import { Role, type AttendanceStatus } from '@prisma/client';
import { format } from 'date-fns';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// ─── Type aliases ───────────────────────────────────────────────────────────

type DisputeRow = {
  id: string;
  attendanceLogId: string;
  userId: string;
  reason: string;
  resolvedBy: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

type DisputeWithRelations = DisputeRow & {
  user: { id: string; fullName: string };
  attendanceLog: {
    id: string;
    date: Date;
    status: string;
    departmentId: string;
    organizationId: string;
  };
};

// ─── ENDPOINT 1: POST /api/disputes ─────────────────────────────────────────

export async function createDispute(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const { attendanceLogId, reason } = req.body as {
      attendanceLogId?: string;
      reason?: string;
    };

    if (!attendanceLogId || !reason) {
      respond.error(res, 'attendanceLogId and reason are required', 400);
      return;
    }

    // 1) Find AttendanceLog — must belong to user
    const log = await prisma.attendanceLog.findUnique({
      where: { id: attendanceLogId },
    });

    if (!log) {
      respond.error(res, 'Attendance log not found', 404);
      return;
    }

    if (log.userId !== userId) {
      respond.error(res, 'This attendance log does not belong to you', 403);
      return;
    }

    // 2) Check no existing open dispute
    const existingDispute = await prisma.dispute.findFirst({
      where: { attendanceLogId, resolvedAt: null },
    });

    if (existingDispute) {
      respond.error(res, 'An open dispute already exists for this log', 409);
      return;
    }

    // 3) Create Dispute
    const dispute = await prisma.dispute.create({
      data: { attendanceLogId, userId, reason },
    });

    // 4) Update AttendanceLog status to DISPUTED
    await prisma.attendanceLog.update({
      where: { id: attendanceLogId },
      data: { status: 'DISPUTED' },
    });

    // 5) Notify supervisor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: { select: { supervisorId: true, name: true } } },
    });

    if (user?.department?.supervisorId) {
      await prisma.notification.create({
        data: {
          userId: user.department.supervisorId,
          title: 'Dispute Filed',
          body: `${user.fullName} filed a dispute for ${format(log.date, 'yyyy-MM-dd')}: ${reason}`,
          type: 'DISPUTE_FILED',
        },
      });
    }

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'DISPUTE_FILED',
        tableName: 'Dispute',
        recordId: dispute.id,
        reason,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { dispute }, 201);
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 2: GET /api/disputes ──────────────────────────────────────────

export async function getDisputes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userRole = req.user!.role;
    const supervisorId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const { status, departmentId: queryDeptId } = req.query as {
      status?: string;
      departmentId?: string;
    };

    // Scope for DEPARTMENT_SUPERVISOR
    let scopedDeptId = queryDeptId;
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { departmentId: true },
      });
      scopedDeptId = sup?.departmentId ?? undefined;
    }

    // Build where
    const where: Record<string, unknown> = {
      attendanceLog: { organizationId },
    };
    if (status === 'OPEN') where.resolvedAt = null;
    if (status === 'RESOLVED') where.resolvedAt = { not: null };
    if (scopedDeptId) where.attendanceLog = { organizationId, departmentId: scopedDeptId };

    const disputes = (await prisma.dispute.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
        attendanceLog: {
          select: {
            id: true,
            date: true,
            status: true,
            departmentId: true,
            organizationId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as DisputeWithRelations[];

    respond.success(res, { disputes });
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 3: PATCH /api/disputes/:id/resolve ────────────────────────────

export async function resolveDispute(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const disputeId = req.params.id as string;
    const resolverId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const { resolution, correctedStatus } = req.body as {
      resolution?: string;
      correctedStatus?: AttendanceStatus;
    };

    if (!resolution) {
      respond.error(res, 'resolution is required', 400);
      return;
    }

    // 1) Find dispute with relations
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        attendanceLog: {
          select: { organizationId: true, departmentId: true, date: true },
        },
      },
    });

    if (!dispute) {
      respond.error(res, 'Dispute not found', 404);
      return;
    }

    if (dispute.resolvedAt) {
      respond.error(res, 'Dispute already resolved', 400);
      return;
    }

    // 2) Verify belongs to supervisor's org
    if (dispute.attendanceLog.organizationId !== organizationId) {
      respond.error(res, 'Access denied', 403);
      return;
    }

    // 3) DEPARTMENT_SUPERVISOR scope check
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: resolverId },
        select: { departmentId: true },
      });
      if (dispute.attendanceLog.departmentId !== sup?.departmentId) {
        respond.error(res, 'Can only resolve disputes in your department', 403);
        return;
      }
    }

    // 4) Update Dispute
    const updatedDispute = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        resolvedBy: resolverId,
        resolution,
        resolvedAt: new Date(),
      },
    });

    // 5) If correctedStatus provided → update AttendanceLog
    let updatedLog = null;
    if (correctedStatus) {
      updatedLog = await prisma.attendanceLog.update({
        where: { id: dispute.attendanceLogId },
        data: {
          status: correctedStatus,
          overriddenBy: resolverId,
          overrideReason: `Dispute resolution: ${resolution}`,
        },
      });
    }

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: resolverId,
        action: 'DISPUTE_RESOLVED',
        tableName: 'Dispute',
        recordId: disputeId,
        reason: resolution,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    // 7) Notify user of resolution
    await prisma.notification.create({
      data: {
        userId: dispute.userId,
        title: 'Dispute Resolved',
        body: `Your dispute for ${format(dispute.attendanceLog.date, 'yyyy-MM-dd')} has been resolved: ${resolution}`,
        type: 'DISPUTE_RESOLVED',
      },
    });

    respond.success(res, {
      dispute: updatedDispute,
      attendanceLog: updatedLog,
    });
  } catch (err) {
    next(err);
  }
}
