import { Role, type AnnouncementCategory } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// ─── Type aliases ───────────────────────────────────────────────────────────

type AnnouncementRow = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  title: string;
  body: string;
  category: string;
  postedById: string;
  requiresAck: boolean;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RawReceipt = {
  id: string;
  userId: string;
  readAt: Date;
  acknowledgedAt: Date | null;
};

type UserRow = { id: string; fullName: string };

// ─── ENDPOINT 1: POST /api/announcements ────────────────────────────────────

export async function createAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const { title, body, category, departmentId, requiresAck, isPinned } = req.body as {
      title?: string;
      body?: string;
      category?: AnnouncementCategory;
      departmentId?: string;
      requiresAck?: boolean;
      isPinned?: boolean;
    };

    if (!title || !body) {
      respond.error(res, 'title and body are required', 400);
      return;
    }

    // DEPARTMENT_SUPERVISOR forced to own department
    let scopedDeptId = departmentId;
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { departmentId: true },
      });
      scopedDeptId = user?.departmentId ?? undefined;
      if (!scopedDeptId) {
        respond.error(res, 'Supervisor must have an assigned department', 400);
        return;
      }
    }

    // Create announcement
    const announcement = await prisma.announcement.create({
      data: {
        organizationId,
        departmentId: scopedDeptId ?? null,
        title,
        body,
        category: category ?? 'STANDARD',
        postedById: userId,
        requiresAck: requiresAck ?? false,
        isPinned: isPinned ?? false,
      },
    });

    // Find target users for notifications
    const userWhere: Record<string, unknown> = {
      organizationId,
      isActive: true,
    };
    if (scopedDeptId) userWhere.departmentId = scopedDeptId;

    const targetUsers = (await prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    })) as { id: string }[];

    // Create notifications for target users (skip author)
    for (const u of targetUsers) {
      if (u.id !== userId) {
        await prisma.notification.create({
          data: {
            userId: u.id,
            title: announcement.title,
            body: announcement.body.substring(0, 200),
            type: 'ANNOUNCEMENT',
          },
        });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'ANNOUNCEMENT_CREATED',
        tableName: 'Announcement',
        recordId: announcement.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { announcement }, 201);
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 2: GET /api/announcements ─────────────────────────────────────

export async function getAnnouncements(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const { departmentId, category, pinned } = req.query as {
      departmentId?: string;
      category?: string;
      pinned?: string;
    };

    // Get user's department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });

    // Build filter: org-wide + user's department
    const where: Record<string, unknown> = {
      organizationId,
      OR: [{ departmentId: null }, { departmentId: user?.departmentId }],
    };
    if (departmentId) where.departmentId = departmentId;
    if (category) where.category = category;
    if (pinned === 'true') where.isPinned = true;

    const announcements = (await prisma.announcement.findMany({
      where,
      include: {
        _count: { select: { readReceipts: true } },
        readReceipts: {
          where: { userId },
          select: { readAt: true, acknowledgedAt: true },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    })) as (AnnouncementRow & {
      _count: { readReceipts: number };
      readReceipts: { readAt: Date; acknowledgedAt: Date | null }[];
    })[];

    // Get total targeted users for each announcement
    const enriched = await Promise.all(
      announcements.map(async (ann) => {
        const targetWhere: Record<string, unknown> = {
          organizationId,
          isActive: true,
        };
        if (ann.departmentId) targetWhere.departmentId = ann.departmentId;

        const totalTargeted = await prisma.user.count({ where: targetWhere });
        const userReceipt = ann.readReceipts[0];

        return {
          ...ann,
          readCount: ann._count.readReceipts,
          totalTargeted,
          userHasRead: !!userReceipt,
          userHasAcknowledged: !!userReceipt?.acknowledgedAt,
        };
      }),
    );

    respond.success(res, { announcements: enriched });
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 3: PATCH /api/announcements/:id/read ──────────────────────────

export async function markAnnouncementRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const annId = req.params.id as string;

    const announcement = await prisma.announcement.findUnique({
      where: { id: annId },
    });

    if (!announcement) {
      respond.error(res, 'Announcement not found', 404);
      return;
    }

    // Upsert read receipt
    const receipt = await prisma.readReceipt.upsert({
      where: { announcementId_userId: { announcementId: annId, userId } },
      update: {},
      create: { announcementId: annId, userId },
    });

    respond.success(res, { readAt: receipt.readAt });
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 4: PATCH /api/announcements/:id/acknowledge ───────────────────

export async function acknowledgeAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const annId = req.params.id as string;

    const announcement = await prisma.announcement.findUnique({
      where: { id: annId },
    });

    if (!announcement) {
      respond.error(res, 'Announcement not found', 404);
      return;
    }

    if (!announcement.requiresAck) {
      respond.error(res, 'This announcement does not require acknowledgment', 400);
      return;
    }

    // Upsert receipt with acknowledgedAt
    const receipt = await prisma.readReceipt.upsert({
      where: { announcementId_userId: { announcementId: annId, userId } },
      update: { acknowledgedAt: new Date() },
      create: {
        announcementId: annId,
        userId,
        acknowledgedAt: new Date(),
      },
    });

    respond.success(res, { acknowledgedAt: receipt.acknowledgedAt });
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 5: GET /api/announcements/:id/receipts ────────────────────────

export async function getReceipts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const annId = req.params.id as string;

    const announcement = await prisma.announcement.findUnique({
      where: { id: annId },
    });

    if (!announcement) {
      respond.error(res, 'Announcement not found', 404);
      return;
    }

    // ReadReceipt has no direct user relation — fetch separately
    const rawReceipts = (await prisma.readReceipt.findMany({
      where: { announcementId: annId },
      select: { id: true, userId: true, readAt: true, acknowledgedAt: true },
      orderBy: { readAt: 'desc' },
    })) as RawReceipt[];

    // Fetch user names for all receipt userIds
    const userIds = rawReceipts.map((r: RawReceipt) => r.userId);
    const users =
      userIds.length > 0
        ? ((await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
          })) as UserRow[])
        : [];

    const userMap = new Map(users.map((u: UserRow) => [u.id, u.fullName]));

    const total = await prisma.user.count({
      where: {
        organizationId: announcement.organizationId,
        isActive: true,
        ...(announcement.departmentId && { departmentId: announcement.departmentId }),
      },
    });

    respond.success(res, {
      total,
      read: rawReceipts.length,
      receipts: rawReceipts.map((r: RawReceipt) => ({
        user: { id: r.userId, fullName: userMap.get(r.userId) ?? 'Unknown' },
        readAt: r.readAt,
        acknowledgedAt: r.acknowledgedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ─── ENDPOINT 6: DELETE /api/announcements/:id ──────────────────────────────

export async function archiveAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const annId = req.params.id as string;

    const announcement = await prisma.announcement.findUnique({
      where: { id: annId },
    });

    if (!announcement) {
      respond.error(res, 'Announcement not found', 404);
      return;
    }

    if (announcement.organizationId !== organizationId) {
      respond.error(res, 'Access denied', 403);
      return;
    }

    // Archive: unpin and touch updatedAt
    await prisma.announcement.update({
      where: { id: annId },
      data: { isPinned: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'ANNOUNCEMENT_ARCHIVED',
        tableName: 'Announcement',
        recordId: annId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'Announcement archived' });
  } catch (err) {
    next(err);
  }
}
