import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// ─── Type alias for findMany result ─────────────────────────────────────────

type NotificationRow = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
};

// ─── GET /api/notifications ─────────────────────────────────────────────────

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = (await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly && { isRead: false }),
      },
      orderBy: { createdAt: 'desc' },
    })) as NotificationRow[];

    const unreadCount = notifications.filter((n: NotificationRow) => !n.isRead).length;

    respond.success(res, { notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/notifications/:id/read ──────────────────────────────────────

export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const notifId = req.params.id as string;

    const notification = await prisma.notification.findUnique({
      where: { id: notifId },
    });

    if (!notification) {
      respond.error(res, 'Notification not found', 404);
      return;
    }

    if (notification.userId !== userId) {
      respond.error(res, 'Access denied', 403);
      return;
    }

    const updated = await prisma.notification.update({
      where: { id: notifId },
      data: { isRead: true },
    });

    respond.success(res, { notification: updated });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/notifications/read-all ──────────────────────────────────────

export async function markAllAsRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    respond.success(res, { updated: result.count });
  } catch (err) {
    next(err);
  }
}
