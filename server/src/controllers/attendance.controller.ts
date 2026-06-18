import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { verifyQRToken } from '../utils/qr.js';
import { calculateAttendanceStatus, calculateCheckOutStatus } from '../utils/attendance.js';
import * as respond from '../utils/response.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Gets today's date string in the org timezone (YYYY-MM-DD).
 */
function getTodayInTimezone(timezone: string): string {
  const zoned = toZonedTime(new Date(), timezone);
  return format(zoned, 'yyyy-MM-dd');
}

// ─── POST /api/attendance/checkin ───────────────────────────────────────────

export async function checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { qrToken } = req.body as { qrToken?: string };
    if (!qrToken || typeof qrToken !== 'string') {
      respond.error(res, 'qrToken is required', 400);
      return;
    }

    // 1) Verify QR token
    const qr = verifyQRToken(qrToken);
    if (!qr) {
      respond.error(res, 'Invalid or expired QR token', 400);
      return;
    }

    // 2) Check org match
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    if (qr.orgId !== organizationId) {
      respond.error(res, 'QR token does not belong to your organization', 403);
      return;
    }

    // 3) Get user with department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, organization: true },
    });

    if (!user || !user.department) {
      respond.error(res, 'User or department not found', 400);
      return;
    }

    const orgTimezone = user.organization.timezone;
    const todayStr = getTodayInTimezone(orgTimezone);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // 4) Check for existing check-in today
    const existing = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    if (existing) {
      respond.error(res, 'Already checked in today', 409);
      return;
    }

    // 5) Get schedule for user's role in their department
    const schedule = await prisma.schedule.findUnique({
      where: {
        departmentId_userType: {
          departmentId: user.departmentId!,
          userType: user.role,
        },
      },
    });

    const cutoffTime = schedule?.cutoffTime ?? '10:00';
    const gracePeriodMins = schedule?.gracePeriodMins ?? 15;

    // 6) Calculate status
    const now = new Date();
    const status = calculateAttendanceStatus(
      now,
      user.department.shiftStart,
      cutoffTime,
      gracePeriodMins,
      orgTimezone,
    );

    // 7) Create attendance log
    const log = await prisma.attendanceLog.create({
      data: {
        userId,
        organizationId,
        departmentId: user.departmentId!,
        date: todayDate,
        checkInTime: now,
        checkInMethod: 'QR',
        status,
      },
    });

    // 8) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'CHECKIN',
        tableName: 'AttendanceLog',
        recordId: log.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(
      res,
      {
        attendanceLog: {
          id: log.id,
          status: log.status,
          checkInTime: log.checkInTime,
          date: log.date,
        },
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/attendance/checkout ──────────────────────────────────────────

export async function checkOut(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { qrToken } = req.body as { qrToken?: string };
    if (!qrToken || typeof qrToken !== 'string') {
      respond.error(res, 'qrToken is required', 400);
      return;
    }

    // 1) Verify QR token
    const qr = verifyQRToken(qrToken);
    if (!qr) {
      respond.error(res, 'Invalid or expired QR token', 400);
      return;
    }

    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // 2) Check org match
    if (qr.orgId !== organizationId) {
      respond.error(res, 'QR token does not belong to your organization', 403);
      return;
    }

    // 3) Get user with department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, organization: true },
    });

    if (!user || !user.department) {
      respond.error(res, 'User or department not found', 400);
      return;
    }

    const orgTimezone = user.organization.timezone;
    const todayStr = getTodayInTimezone(orgTimezone);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // 4) Find today's log
    const log = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    if (!log) {
      respond.error(res, "You haven't checked in today", 400);
      return;
    }

    // 5) Already checked out?
    if (log.checkOutTime) {
      respond.error(res, 'Already checked out', 409);
      return;
    }

    // 6) Calculate checkout status
    const now = new Date();
    const checkoutStatus = calculateCheckOutStatus(now, user.department.shiftEnd, orgTimezone);

    // 7) Update log
    const newStatus = checkoutStatus === 'LEFT_EARLY' ? 'LEFT_EARLY' : log.status;

    const updated = await prisma.attendanceLog.update({
      where: { id: log.id },
      data: {
        checkOutTime: now,
        checkOutMethod: 'SCANNED',
        status: newStatus,
      },
    });

    // 8) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'CHECKOUT',
        tableName: 'AttendanceLog',
        recordId: log.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, {
      attendanceLog: {
        id: updated.id,
        status: updated.status,
        checkInTime: updated.checkInTime,
        checkOutTime: updated.checkOutTime,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/attendance/checkout/self-report ──────────────────────────────

export async function selfReportCheckOut(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { date, reportedCheckOutTime } = req.body as {
      date?: string;
      reportedCheckOutTime?: string;
    };

    if (!date) {
      respond.error(res, 'date is required', 400);
      return;
    }
    if (!reportedCheckOutTime) {
      respond.error(res, 'reportedCheckOutTime is required', 400);
      return;
    }

    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // Parse the date for lookup
    const targetDate = new Date(date + 'T00:00:00.000Z');

    // 1) Find the attendance log
    const log = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: targetDate } },
    });

    if (!log) {
      respond.error(res, 'No attendance record found for this date', 404);
      return;
    }

    // 2) Already has scanned checkout?
    if (log.checkOutTime && log.checkOutMethod === 'SCANNED') {
      respond.error(res, 'Checkout already recorded via scan', 409);
      return;
    }

    // 3) Validate reported time is after check-in
    const reported = new Date(reportedCheckOutTime);
    if (log.checkInTime && reported <= log.checkInTime) {
      respond.error(res, 'Reported checkout time must be after check-in time', 400);
      return;
    }

    // 4) Get user's department shift end for validation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true },
    });

    if (user?.department) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { timezone: true },
      });
      const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
      const checkoutStatus = calculateCheckOutStatus(
        reported,
        user.department.shiftEnd,
        orgTimezone,
      );

      if (checkoutStatus !== 'LEFT_EARLY') {
        // Reported time is after shift end — supervisor can review flagged records
      }
    }

    // 5) Update log
    const updated = await prisma.attendanceLog.update({
      where: { id: log.id },
      data: {
        checkOutTime: reported,
        checkOutMethod: 'USER_REPORTED',
      },
    });

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'CHECKOUT_SELF_REPORTED',
        tableName: 'AttendanceLog',
        recordId: log.id,
        reason: `Self-reported checkout for ${date}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, {
      attendanceLog: {
        id: updated.id,
        status: updated.status,
        checkInTime: updated.checkInTime,
        checkOutTime: updated.checkOutTime,
        checkOutMethod: updated.checkOutMethod,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/attendance/today ──────────────────────────────────────────────

export async function getToday(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // Get org timezone
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const todayStr = getTodayInTimezone(orgTimezone);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    const log = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    respond.success(res, {
      log: log ?? null,
      checkInRequired: !log,
    });
  } catch (err) {
    next(err);
  }
}
