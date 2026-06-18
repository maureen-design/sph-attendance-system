import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Role, type LeaveType, type AttendanceStatus } from '@prisma/client';
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

// ─── POST /api/attendance/excuse ────────────────────────────────────────────

export async function submitExcuse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { date, reason, type } = req.body as {
      date?: string;
      reason?: string;
      type?: LeaveType;
    };

    if (!date) {
      respond.error(res, 'date is required', 400);
      return;
    }
    if (!reason) {
      respond.error(res, 'reason is required', 400);
      return;
    }
    if (!type) {
      respond.error(res, 'type is required', 400);
      return;
    }

    const validTypes: LeaveType[] = ['SICK', 'EMERGENCY', 'OFFICIAL_DUTY', 'OTHER'];
    if (!validTypes.includes(type)) {
      respond.error(res, 'type must be SICK, EMERGENCY, OFFICIAL_DUTY, or OTHER', 400);
      return;
    }

    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;
    const targetDate = new Date(date + 'T00:00:00.000Z');

    // 1) Find AttendanceLog for user + date
    const log = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: targetDate } },
    });

    if (!log) {
      respond.error(res, 'No attendance record found for this date', 404);
      return;
    }

    // 2) Check status allows excuse
    const excusableStatuses = ['UNRESOLVED', 'ABSENT_UNEXCUSED'];
    if (!excusableStatuses.includes(log.status)) {
      respond.error(res, 'No absence to excuse for this date', 400);
      return;
    }

    // 3) Create Leave record
    const leave = await prisma.leave.create({
      data: {
        userId,
        type,
        startDate: targetDate,
        endDate: targetDate,
        reason,
        status: 'PENDING',
      },
    });

    // 4) Update AttendanceLog status
    await prisma.attendanceLog.update({
      where: { id: log.id },
      data: { status: 'ABSENT_EXCUSE_PENDING' },
    });

    // 5) Notify department supervisor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: { select: { supervisorId: true, name: true } } },
    });

    if (user?.department?.supervisorId) {
      await prisma.notification.create({
        data: {
          userId: user.department.supervisorId,
          title: 'Excuse Request Submitted',
          body: `${user.fullName} submitted an excuse for ${date} (${type}): ${reason}`,
          type: 'EXCUSE_REQUEST',
        },
      });
    }

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: 'EXCUSE_SUBMITTED',
        tableName: 'Leave',
        recordId: leave.id,
        reason: `Excuse for ${date}: ${type} - ${reason}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, {
      leave: { id: leave.id, type: leave.type, status: leave.status },
      message: 'Excuse submitted',
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/attendance/excuse/:leaveId ──────────────────────────────────

export async function decideExcuse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const leaveId = req.params.leaveId as string;
    const { decision, decisionNote } = req.body as {
      decision?: string;
      decisionNote?: string;
    };

    if (!decision || (decision !== 'APPROVED' && decision !== 'REJECTED')) {
      respond.error(res, 'decision must be APPROVED or REJECTED', 400);
      return;
    }

    const reviewerId = req.user!.id;
    const reviewerOrgId = req.user!.organizationId;
    const reviewerRole = req.user!.role;

    // 1) Find Leave
    const leave = await prisma.leave.findUnique({
      where: { id: leaveId },
      include: {
        user: { select: { organizationId: true, departmentId: true, fullName: true } },
      },
    });

    if (!leave) {
      respond.error(res, 'Leave request not found', 404);
      return;
    }

    // 2) Verify org match
    if (leave.user.organizationId !== reviewerOrgId) {
      respond.error(res, 'Cannot review leaves from another organization', 403);
      return;
    }

    // 3) DEPARTMENT_SUPERVISOR can only review their own department
    if (reviewerRole === 'DEPARTMENT_SUPERVISOR') {
      const reviewer = await prisma.user.findUnique({
        where: { id: reviewerId },
        select: { departmentId: true },
      });
      if (reviewer?.departmentId !== leave.user.departmentId) {
        respond.error(res, 'Can only review leave requests in your department', 403);
        return;
      }
    }

    // 4) Update Leave
    const updatedLeave = await prisma.leave.update({
      where: { id: leaveId },
      data: {
        status: decision,
        decidedBy: reviewerId,
        decisionNote: decisionNote ?? null,
        decidedAt: new Date(),
      },
    });

    // 5) Update AttendanceLog status
    const newLogStatus = decision === 'APPROVED' ? 'ABSENT_EXCUSED' : 'ABSENT_UNEXCUSED';
    const targetDate = leave.startDate;

    const updatedLog = await prisma.attendanceLog.update({
      where: { userId_date: { userId: leave.userId, date: targetDate } },
      data: { status: newLogStatus },
    });

    // 6) Notify the user
    await prisma.notification.create({
      data: {
        userId: leave.userId,
        title: `Excuse ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`,
        body:
          decision === 'APPROVED'
            ? `Your excuse for ${format(targetDate, 'yyyy-MM-dd')} has been approved.`
            : `Your excuse for ${format(targetDate, 'yyyy-MM-dd')} has been rejected.${decisionNote ? ` Reason: ${decisionNote}` : ''}`,
        type: 'EXCUSE_DECISION',
      },
    });

    // 7) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: reviewerOrgId,
        actorId: reviewerId,
        action: 'EXCUSE_DECIDED',
        tableName: 'Leave',
        recordId: leaveId,
        reason: `${decision}${decisionNote ? `: ${decisionNote}` : ''}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, {
      leave: updatedLeave,
      attendanceLog: updatedLog,
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/attendance/:id/override ─────────────────────────────────────

export async function overrideAttendance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const logId = req.params.id as string;
    const actorId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const { status, reason } = req.body as {
      status?: AttendanceStatus;
      reason?: string;
    };

    if (!status) {
      respond.error(res, 'status is required', 400);
      return;
    }
    if (!reason) {
      respond.error(res, 'reason is required', 400);
      return;
    }

    // 1) Find AttendanceLog
    const log = await prisma.attendanceLog.findUnique({
      where: { id: logId },
    });

    if (!log) {
      respond.error(res, 'Attendance log not found', 404);
      return;
    }

    // 2) Verify belongs to supervisor's org
    if (log.organizationId !== organizationId) {
      respond.error(res, 'Access denied', 403);
      return;
    }

    // 3) DEPARTMENT_SUPERVISOR: verify department match
    if (userRole === Role.DEPARTMENT_SUPERVISOR) {
      const sup = await prisma.user.findUnique({
        where: { id: actorId },
        select: { departmentId: true },
      });
      if (log.departmentId !== sup?.departmentId) {
        respond.error(res, 'Can only override records in your department', 403);
        return;
      }
    }

    // 4) Store previous status
    const previousStatus = log.status;

    // 5) Update AttendanceLog
    const updated = await prisma.attendanceLog.update({
      where: { id: logId },
      data: {
        status,
        overriddenBy: actorId,
        overrideReason: reason,
      },
    });

    // 6) Audit log
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId,
        action: 'ATTENDANCE_OVERRIDDEN',
        tableName: 'AttendanceLog',
        recordId: logId,
        reason: `Status: ${previousStatus} → ${status}. Reason: ${reason}`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    // 7) Notify affected user
    await prisma.notification.create({
      data: {
        userId: log.userId,
        title: 'Attendance Record Updated',
        body: `Your attendance record for ${format(log.date, 'yyyy-MM-dd')} was updated by your supervisor`,
        type: 'ATTENDANCE_OVERRIDE',
      },
    });

    respond.success(res, { attendanceLog: updated });
  } catch (err) {
    next(err);
  }
}
