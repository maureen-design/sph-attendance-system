import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { Prisma } from '@prisma/client';
import * as respond from '../utils/response.js';

// --- GET /api/approvals/pending ----------------------------------------------

export async function getPendingApprovals(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const supervisorId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const supervisor = await prisma.user.findUnique({
      where: { id: supervisorId },
      select: { departmentId: true, role: true },
    });

    if (!supervisor) {
      respond.error(res, 'User not found', 404);
      return;
    }

    const where: Prisma.UserWhereInput = {
      organizationId,
      status: 'PENDING_APPROVAL',
    };

    if (supervisor.role === 'DEPARTMENT_SUPERVISOR' && supervisor.departmentId) {
      where.departmentId = supervisor.departmentId;
    }

    const pending = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
        cohort: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    respond.success(res, { users: pending });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/approvals/:id/approve ----------------------------------------

export async function approveUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const supervisorId = req.user!.id;
    const targetUserId = req.params.id as string;

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      respond.error(res, 'User not found', 404);
      return;
    }

    if (target.status !== 'PENDING_APPROVAL') {
      respond.error(res, 'User is not pending approval', 400);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: 'ACTIVE',
        approvedBy: supervisorId,
        approvedAt: new Date(),
      },
    });

    // Notify the approved user
    try {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          title: 'Account Approved',
          body: 'Your account has been approved. You can now check in.',
          type: 'APPROVAL_GRANTED',
        },
      });
    } catch (notifErr) {
      console.error('[approve] Failed to notify user:', (notifErr as Error).message);
    }

    respond.success(res, {
      user: {
        id: updated.id,
        fullName: updated.fullName,
        status: updated.status,
      },
      message: 'User approved successfully',
    });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/approvals/:id/reject -----------------------------------------

export async function rejectUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const supervisorId = req.user!.id;
    const targetUserId = req.params.id as string;
    const { reason } = req.body as { reason?: string };

    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!target) {
      respond.error(res, 'User not found', 404);
      return;
    }

    if (target.status !== 'PENDING_APPROVAL') {
      respond.error(res, 'User is not pending approval', 400);
      return;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: 'REJECTED',
        approvedBy: supervisorId,
        approvedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    // Notify the rejected user
    try {
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          title: 'Account Registration Rejected',
          body: reason
            ? `Your registration was rejected: ${reason}`
            : 'Your registration was rejected.',
          type: 'APPROVAL_DENIED',
        },
      });
    } catch (notifErr) {
      console.error('[reject] Failed to notify user:', (notifErr as Error).message);
    }

    respond.success(res, {
      user: {
        id: updated.id,
        fullName: updated.fullName,
        status: updated.status,
      },
      message: 'User rejected',
    });
  } catch (err) {
    next(err);
  }
}
