import { format, subDays, eachDayOfInterval, isWeekend, startOfWeek, endOfWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Role, type LeaveType, type AttendanceStatus } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { calculateAttendanceStatus, calculateCheckOutStatus } from '../utils/attendance.js';
import * as respond from '../utils/response.js';

type SimpleWL = { date: Date; id: string };
type SimpleDispute = {
  attendanceLogId: string;
  resolvedAt: Date | null;
  resolution: string | null;
  id: string;
};
type SimpleHoliday = { date: Date };
type TrendWeek = { weekStart: string; score: number; present: number; total: number };

// --- Helpers ----------------------------------------------------------------

/**
 * Gets today's date string in the org timezone (YYYY-MM-DD).
 */
function getTodayInTimezone(timezone: string): string {
  const zoned = toZonedTime(new Date(), timezone);
  return format(zoned, 'yyyy-MM-dd');
}

// --- POST /api/attendance/check-in ------------------------------------------

export async function checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // 1) Get user with department
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, organization: true },
    });

    if (!user || !user.department) {
      respond.error(res, 'User or department not found', 400);
      return;
    }

    // Status guard: only ACTIVE users can check in
    if (user.status !== 'ACTIVE') {
      if (user.status === 'PENDING_APPROVAL') {
        respond.error(res, 'Your account is pending approval from a supervisor', 403);
      } else if (user.status === 'REJECTED') {
        respond.error(res, 'Your registration was rejected. Contact your supervisor.', 403);
      } else {
        respond.error(res, 'Your account is not active', 403);
      }
      return;
    }

    const orgTimezone = user.organization.timezone;
    const todayStr = getTodayInTimezone(orgTimezone);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // 2) Check for existing check-in today
    const existing = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    if (existing) {
      // If the existing log has no check-in time, it's a placeholder (seed/auto-created).
      // Allow overwriting it with the real check-in.
      if (existing.checkInTime === null) {
        await prisma.attendanceLog.delete({ where: { id: existing.id } });
      } else {
        respond.error(res, 'Already checked in today', 409);
        return;
      }
    }

    // 3) Get schedule for user's role in their department
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

    // 4) Calculate status
    const now = new Date();
    const status = calculateAttendanceStatus(
      now,
      user.department.shiftStart,
      cutoffTime,
      gracePeriodMins,
      orgTimezone,
    );

    if (status === 'UNRESOLVED') {
      respond.error(res, 'Check-in failed: could not determine attendance status', 500);
      return;
    }

    // 5) Create attendance log
    const log = await prisma.attendanceLog.create({
      data: {
        userId,
        organizationId,
        departmentId: user.departmentId!,
        date: todayDate,
        checkInTime: now,
        checkInMethod: 'SIMPLE',
        status,
      },
    });

    if (!log.checkInTime) {
      respond.error(res, 'Check-in failed: check-in time was not stored', 500);
      return;
    }

    // 6) Audit log
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

// --- POST /api/attendance/check-out -----------------------------------------

export async function checkOut(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    // 1) Get user with department
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

    // 2) Find today's log
    const log = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    if (!log) {
      respond.error(res, "You haven't checked in today", 400);
      return;
    }

    // 3) Already checked out?
    if (log.checkOutTime) {
      respond.error(res, 'Already checked out', 409);
      return;
    }

    // 4) Calculate checkout status
    const now = new Date();
    const checkoutStatus = calculateCheckOutStatus(now, user.department.shiftEnd, orgTimezone);
    const newStatus = checkoutStatus === 'LEFT_EARLY' ? 'LEFT_EARLY' : log.status;

    // 5) Update log
    const updated = await prisma.attendanceLog.update({
      where: { id: log.id },
      data: {
        checkOutTime: now,
        checkOutMethod: 'SIMPLE',
        status: newStatus,
      },
    });

    // 6) Audit log
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

// --- GET /api/attendance/forgotten-checkout ---------------------------------

export async function getForgottenCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, organization: true },
    });
    if (!user || !user.department) {
      respond.success(res, { forgotten: null, shiftEnd: null });
      return;
    }

    const orgTimezone = user.organization.timezone;
    const todayStr = getTodayInTimezone(orgTimezone);
    const todayDate = new Date(todayStr + 'T00:00:00.000Z');

    // Find the most recent log with no checkout before today
    const forgotten = await prisma.attendanceLog.findFirst({
      where: { userId, checkOutTime: null, date: { lt: todayDate } },
      orderBy: { date: 'desc' },
    });

    respond.success(res, {
      forgotten: forgotten
        ? {
            id: forgotten.id,
            date: format(forgotten.date, 'yyyy-MM-dd'),
            checkInTime: forgotten.checkInTime,
          }
        : null,
      shiftEnd: user.department.shiftEnd,
    });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/attendance/checkout/self-report ------------------------------

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
        // Reported time is after shift end - supervisor can review flagged records
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

// --- GET /api/attendance/today ----------------------------------------------

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

// --- POST /api/attendance/excuse --------------------------------------------

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

// --- PATCH /api/attendance/excuse/:leaveId ----------------------------------

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

// --- PATCH /api/attendance/:id/override -------------------------------------

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
        reason: `Status: ${previousStatus} -> ${status}. Reason: ${reason}`,
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

// --- GET /api/attendance/history?year=2026&month=7  --------------------------

export async function getAttendanceHistory(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const year = parseInt(req.query.year as string, 10) || new Date().getFullYear();
    const month = parseInt(req.query.month as string, 10) || new Date().getMonth() + 1;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Attendance logs for the month
    const logs = await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });

    // Work logs for the month
    const workLogs = await prisma.workLog.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      select: { date: true, id: true },
    });
    const workLogByDate = new Map(
      workLogs.map((wl: SimpleWL) => [format(wl.date, 'yyyy-MM-dd'), wl.id]),
    );

    // Disputes for those attendance logs
    const logIds = logs.map((l: { id: string }) => l.id);
    const disputes =
      logIds.length > 0
        ? await prisma.dispute.findMany({
            where: { attendanceLogId: { in: logIds } },
            select: { attendanceLogId: true, resolvedAt: true, resolution: true, id: true },
          })
        : [];
    const disputeByLogId = new Map(disputes.map((d: SimpleDispute) => [d.attendanceLogId, d]));

    // Holidays for the month
    const holidays = await prisma.holiday.findMany({
      where: { organizationId, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h: SimpleHoliday) => format(h.date, 'yyyy-MM-dd')));

    // Weekend + holiday day strings for the legend
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const weekendDays = allDays.filter((d) => isWeekend(d)).length;
    const holidayDays = allDays.filter((d) => holidaySet.has(format(d, 'yyyy-MM-dd'))).length;

    // Status counts for the legend
    const statusCounts: Record<string, number> = {};
    for (const log of logs) {
      statusCounts[log.status] = (statusCounts[log.status] || 0) + 1;
    }

    respond.success(res, {
      logs: logs.map(
        (log: {
          id: string;
          date: Date;
          checkInTime: Date | null;
          checkOutTime: Date | null;
          status: string;
        }) => ({
          id: log.id,
          date: format(log.date, 'yyyy-MM-dd'),
          checkInTime: log.checkInTime?.toISOString() ?? null,
          checkOutTime: log.checkOutTime?.toISOString() ?? null,
          status: log.status,
          hours:
            log.checkInTime && log.checkOutTime
              ? Math.round(
                  ((log.checkOutTime.getTime() - log.checkInTime.getTime()) / 3600000) * 100,
                ) / 100
              : null,
          workLogId: workLogByDate.get(format(log.date, 'yyyy-MM-dd')) ?? null,
          dispute: disputeByLogId.get(log.id) ?? null,
        }),
      ),
      statusCounts,
      weekendDays,
      holidayDays,
      month: { year, month },
    });
  } catch (err) {
    next(err);
  }
}

// --- GET /api/attendance/trend?weeks=12 --------------------------------------

export async function getAttendanceTrend(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const weeks = Math.min(Math.max(parseInt(req.query.weeks as string, 10) || 12, 4), 52);
    const endDate = new Date();
    const startDate = subDays(endDate, weeks * 7);

    // Holidays in range
    const holidays = await prisma.holiday.findMany({
      where: { organizationId, date: { gte: startDate, lte: endDate } },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h: SimpleHoliday) => format(h.date, 'yyyy-MM-dd')));

    // All logs in range
    const logs = await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });
    const logByDate = new Map(
      logs.map((l: { id: string; date: Date; status: string }) => [
        format(l.date, 'yyyy-MM-dd'),
        l,
      ]),
    );

    // Build weekly buckets
    const weeksData: TrendWeek[] = [];
    let cursor = startOfWeek(startDate, { weekStartsOn: 1 });

    while (cursor <= endDate) {
      const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: cursor, end: weekEnd });
      const workingDays = days.filter(
        (d: Date) => !isWeekend(d) && !holidaySet.has(format(d, 'yyyy-MM-dd')),
      );
      let present = 0;
      for (const d of workingDays) {
        const ds = format(d, 'yyyy-MM-dd');
        const log = logByDate.get(ds) as { status: string } | undefined;
        if (log && (log.status === 'ON_TIME' || log.status === 'EARLY')) present++;
      }
      const score = workingDays.length > 0 ? Math.round((present / workingDays.length) * 100) : 100;
      weeksData.push({
        weekStart: format(cursor, 'yyyy-MM-dd'),
        score,
        present,
        total: workingDays.length,
      });
      cursor = new Date(weekEnd.getTime() + 86400000);
    }

    // Current score
    const allWorkingDays = weeksData.reduce((sum: number, w: TrendWeek) => sum + w.total, 0);
    const allPresent = weeksData.reduce((sum: number, w: TrendWeek) => sum + w.present, 0);
    const currentScore = allWorkingDays > 0 ? Math.round((allPresent / allWorkingDays) * 100) : 100;

    // Previous period score for comparison
    const mid = Math.floor(weeksData.length / 2);
    const recentWeeks = weeksData.slice(mid);
    const prevWeeks = weeksData.slice(0, mid);
    const recentTotal = recentWeeks.reduce((s, w) => s + w.total, 0);
    const recentPresent = recentWeeks.reduce((s, w) => s + w.present, 0);
    const prevTotal = prevWeeks.reduce((s, w) => s + w.total, 0);
    const prevPresent = prevWeeks.reduce((s, w) => s + w.present, 0);
    const recentScore = recentTotal > 0 ? Math.round((recentPresent / recentTotal) * 100) : 100;
    const prevScore = prevTotal > 0 ? Math.round((prevPresent / prevTotal) * 100) : 100;

    respond.success(res, {
      weeks: weeksData,
      currentScore,
      comparison: recentScore - prevScore,
    });
  } catch (err) {
    next(err);
  }
}
