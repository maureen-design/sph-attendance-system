import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// --- GET /api/invites/cohorts -------------------------------------------------

export async function getCohortsForInvite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;
    const cohorts = await prisma.cohort.findMany({
      where: { organizationId },
      select: { id: true, name: true, startDate: true },
      orderBy: { name: 'asc' },
    });
    respond.success(res, { cohorts });
  } catch (err) {
    next(err);
  }
}

// --- GET /api/invites/departments ---------------------------------------------

export async function getDepartmentsForInvite(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;
    const departments = await prisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    respond.success(res, { departments });
  } catch (err) {
    next(err);
  }
}

// --- GET /api/invites ---------------------------------------------------------

export async function getInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;

    const invites = await prisma.inviteLink.findMany({
      where: { cohort: { organizationId } },
      include: {
        cohort: { select: { id: true, name: true, startDate: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    respond.success(res, { invites });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/invites --------------------------------------------------------

export async function createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    const { cohortId, departmentId, maxUses } = req.body as {
      cohortId?: string;
      departmentId?: string | null;
      maxUses?: number;
    };

    if (!cohortId) {
      respond.error(res, 'cohortId is required', 400);
      return;
    }

    // Verify cohort belongs to this org
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      select: { id: true, organizationId: true, startDate: true, name: true },
    });

    if (!cohort || cohort.organizationId !== organizationId) {
      respond.error(res, 'Cohort not found', 404);
      return;
    }

    // If departmentId provided, verify it belongs to this org
    if (departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { organizationId: true },
      });
      if (!dept || dept.organizationId !== organizationId) {
        respond.error(res, 'Department not found', 404);
        return;
      }
    }

    // Generate secure random token
    const token = randomBytes(32).toString('hex');
    const maxUsesValue = typeof maxUses === 'number' && maxUses > 0 ? maxUses : 1;

    // Expiry: 7 days from now by default, but capped at cohort start date if that's in the future
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt =
      cohort.startDate > new Date() && cohort.startDate < sevenDaysFromNow
        ? cohort.startDate
        : sevenDaysFromNow;

    const invite = await prisma.inviteLink.create({
      data: {
        token,
        cohortId,
        departmentId: departmentId ?? null,
        maxUses: maxUsesValue,
        expiresAt,
      },
      include: {
        cohort: { select: { id: true, name: true, startDate: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'INVITE_LINK_CREATED',
        tableName: 'InviteLink',
        recordId: invite.id,
        reason: `Created invite link for cohort ${cohort.name}${departmentId ? `, department restricted` : ''}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { invite }, 201);
  } catch (err) {
    next(err);
  }
}

// --- PATCH /api/invites/:id/revoke -------------------------------------------

export async function revokeInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const invite = await prisma.inviteLink.findUnique({
      where: { id },
      include: { cohort: { select: { organizationId: true, name: true } } },
    });

    if (!invite || invite.cohort.organizationId !== organizationId) {
      respond.error(res, 'Invite link not found', 404);
      return;
    }

    if (invite.revokedAt) {
      respond.error(res, 'Invite link is already revoked', 400);
      return;
    }

    const updated = await prisma.inviteLink.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        isActive: false,
      },
      include: {
        cohort: { select: { id: true, name: true, startDate: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'INVITE_LINK_REVOKED',
        tableName: 'InviteLink',
        recordId: invite.id,
        reason: `Revoked invite link for cohort ${invite.cohort.name}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { invite: updated });
  } catch (err) {
    next(err);
  }
}
