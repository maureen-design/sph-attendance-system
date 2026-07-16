import { Role, type LeaveType, type LeaveStatus as LS } from '@prisma/client';
import { format } from 'date-fns';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

type LeaveRow = {
  id: string;
  userId: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: LS;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
};

const VALID_TYPES: LeaveType[] = ['SICK', 'EMERGENCY', 'OFFICIAL_DUTY', 'OTHER'];

// --- ENDPOINT 1: POST /api/leave --------------------------------------------

export async function createLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const { type, startDate, endDate, reason } = req.body as {
      type?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
    };

    // Validation
    if (!type || !startDate || !endDate || !reason) {
      respond.error(res, 'type, startDate, endDate, and reason are required', 400);
      return;
    }
    if (!VALID_TYPES.includes(type as LeaveType)) {
      respond.error(res, `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`, 400);
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      respond.error(res, 'Reason must be at least 10 characters', 400);
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      respond.error(res, 'Invalid date format', 400);
      return;
    }
    if (end < start) {
      respond.error(res, 'endDate must not be before startDate', 400);
      return;
    }

    // Check for overlapping leaves
    const overlap = await prisma.leave.findFirst({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
      },
    });
    if (overlap) {
      respond.error(
        res,
        'You already have a pending or approved leave request that overlaps with these dates',
        409,
      );
      return;
    }

    const leave = (await prisma.leave.create({
      data: {
        userId,
        type: type as LeaveType,
        startDate: start,
        endDate: end,
        reason: trimmedReason,
      },
    })) as LeaveRow;

    // Notify supervisor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        department: { select: { supervisorId: true, name: true } },
      },
    });

    if (user?.department?.supervisorId) {
      await prisma.notification.create({
        data: {
          userId: user.department.supervisorId,
          title: 'New Leave Request',
          body: `${user.fullName} submitted a ${type} leave request from ${format(start, 'MMM d')} to ${format(end, 'MMM d')}: ${trimmedReason}`,
          type: 'LEAVE_SUBMITTED',
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'LEAVE_SUBMITTED',
        tableName: 'Leave',
        recordId: leave.id,
        reason: trimmedReason,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { leave }, 201);
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 2: GET /api/leave/my ------------------------------------------

export async function getMyLeaves(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;

    const leaves = (await prisma.leave.findMany({
      where: { userId },
      include: {
        decider: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })) as (LeaveRow & { decider: { id: string; fullName: string } | null })[];

    respond.success(res, { leaves });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 3: GET /api/leave/pending -------------------------------------

export async function getPendingLeaves(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    // Resolve the department scope
    let scopedDeptId: string | undefined;

    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      scopedDeptId = sup?.departmentId ?? undefined;
      if (!scopedDeptId) {
        respond.error(res, 'No department assigned — contact your administrator', 403);
        return;
      }
    }

    // Build query: pending leaves for users in the scoped department
    const userFilter: Record<string, unknown> = {
      organizationId,
    };
    if (scopedDeptId) userFilter.departmentId = scopedDeptId;

    const leaves = (await prisma.leave.findMany({
      where: {
        status: 'PENDING',
        user: userFilter,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            departmentId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })) as (LeaveRow & {
      user: { id: string; fullName: string; role: string; departmentId: string | null };
    })[];

    respond.success(res, { leaves });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 4: PATCH /api/leave/:id/decide --------------------------------

export async function decideLeave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const leaveId = req.params.id as string;

    const { action, decisionNote } = req.body as {
      action?: string;
      decisionNote?: string;
    };

    if (!action || !['APPROVED', 'REJECTED'].includes(action)) {
      respond.error(res, 'action must be either APPROVED or REJECTED', 400);
      return;
    }
    if (action === 'REJECTED' && (!decisionNote || !decisionNote.trim())) {
      respond.error(res, 'A decision note is required when rejecting a leave request', 400);
      return;
    }

    // Fetch the leave with user info
    const leave = (await prisma.leave.findUnique({
      where: { id: leaveId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            departmentId: true,
            organizationId: true,
          },
        },
      },
    })) as
      | (LeaveRow & {
          user: {
            id: string;
            fullName: string;
            departmentId: string | null;
            organizationId: string;
          };
        })
      | null;

    if (!leave) {
      respond.error(res, 'Leave request not found', 404);
      return;
    }
    if (leave.status !== 'PENDING') {
      respond.error(res, 'This leave request has already been decided', 409);
      return;
    }

    const orgId = req.user!.organizationId;
    if (leave.user.organizationId !== orgId) {
      respond.error(res, 'Cannot decide on leaves from another organization', 403);
      return;
    }

    // DEPARTMENT_SUPERVISOR can only decide on leaves in their own department
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      if (!sup?.departmentId || sup.departmentId !== leave.user.departmentId) {
        respond.error(res, 'Can only decide on leave requests in your own department', 403);
        return;
      }
    }

    // Update the leave
    const updatedLeave = (await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: action as LS,
        decidedBy: userId,
        decisionNote: decisionNote?.trim() ?? null,
        decidedAt: new Date(),
      },
    })) as LeaveRow;

    // Notify the requesting user
    try {
      await prisma.notification.create({
        data: {
          userId: leave.userId,
          title: `Leave Request ${action === 'APPROVED' ? 'Approved' : 'Rejected'}`,
          body:
            action === 'APPROVED'
              ? `Your ${leave.type} leave request from ${format(leave.startDate, 'MMM d')} to ${format(leave.endDate, 'MMM d')} has been approved.`
              : `Your ${leave.type} leave request from ${format(leave.startDate, 'MMM d')} to ${format(leave.endDate, 'MMM d')} was rejected.${decisionNote ? ` Reason: ${decisionNote.trim()}` : ''}`,
          type: 'LEAVE_DECIDED',
        },
      });
    } catch {
      // Non-critical — don't fail the request
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: userId,
        action: action === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        tableName: 'Leave',
        recordId: leaveId,
        reason: decisionNote?.trim() ?? null,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { leave: updatedLeave });
  } catch (err) {
    next(err);
  }
}
