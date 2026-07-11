import { Role, Prisma, type AttendanceStatus } from '@prisma/client';
import {
  format,
  subDays,
  eachDayOfInterval,
  isWeekend,
  startOfWeek,
  endOfWeek,
  subHours,
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// --- Type aliases for findMany results (Prisma v6 type workaround) ----------

type AnyLog = {
  id: string;
  userId: string;
  departmentId: string;
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  checkOutMethod: string | null;
  checkInMethod: string | null;
  status: string;
  overriddenBy: string | null;
};

type LogWithUser = AnyLog & {
  user: { id: string; fullName: string; role: string; cohortId: string | null };
};

type LogWithUserDept = AnyLog & {
  user: {
    fullName: string;
    email: string;
    cohort: { name: string } | null;
  };
  department: { name: string };
};

type BaseUser = { id: string; fullName: string; role: string };

type DeptSummary = {
  id: string;
  name: string;
  _count: { users: number };
};

type SimpleLog = {
  userId: string;
  departmentId: string;
  status: string;
};

type SummaryLogRow = AnyLog & {
  user: {
    id: string;
    fullName: string;
    role: string;
    cohort: { name: string } | null;
  };
};

// --- Helpers ----------------------------------------------------------------

function getTodayStr(timezone: string): string {
  const zoned = toZonedTime(new Date(), timezone);
  return format(zoned, 'yyyy-MM-dd');
}

function isWeekendDate(date: Date): boolean {
  return isWeekend(date);
}

function escapeCsv(val: string | number | null | undefined): string {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function resolveSupervisorDeptId(userId: string): Promise<string | undefined> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true },
  });
  return u?.departmentId ?? undefined;
}

// --- ENDPOINT 1: GET /api/dashboard/supervisor ------------------------------

export async function getSupervisorDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const {
      date: dateStr,
      departmentId: queryDeptId,
      status,
      cohortId,
      search,
    } = req.query as {
      date?: string;
      departmentId?: string;
      status?: AttendanceStatus;
      cohortId?: string;
      search?: string;
    };

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const targetDateStr = dateStr ?? getTodayStr(orgTimezone);
    const targetDate = new Date(targetDateStr + 'T00:00:00.000Z');

    const scopedDeptId =
      userRole === Role.DEPARTMENT_SUPERVISOR ? await resolveSupervisorDeptId(userId) : queryDeptId;

    // Fetch logs - explicit branches avoid spread breaking Prisma type inference
    const logInclude = {
      user: { select: { id: true, fullName: true, role: true, cohortId: true } },
    } as const;

    const logs = (
      scopedDeptId
        ? status
          ? await prisma.attendanceLog.findMany({
              where: { organizationId, date: targetDate, departmentId: scopedDeptId, status },
              include: logInclude,
            })
          : await prisma.attendanceLog.findMany({
              where: { organizationId, date: targetDate, departmentId: scopedDeptId },
              include: logInclude,
            })
        : status
          ? await prisma.attendanceLog.findMany({
              where: { organizationId, date: targetDate, status },
              include: logInclude,
            })
          : await prisma.attendanceLog.findMany({
              where: { organizationId, date: targetDate },
              include: logInclude,
            })
    ) as LogWithUser[];

    // Filter by cohort in-memory
    const filteredLogs = cohortId
      ? logs.filter((l: LogWithUser) => l.user.cohortId === cohortId)
      : logs;

    // Fetch expected users
    const baseUsers = (
      scopedDeptId
        ? cohortId
          ? await prisma.user.findMany({
              where: { organizationId, status: 'ACTIVE', departmentId: scopedDeptId, cohortId },
              select: { id: true, fullName: true, role: true },
            })
          : await prisma.user.findMany({
              where: { organizationId, status: 'ACTIVE', departmentId: scopedDeptId },
              select: { id: true, fullName: true, role: true },
            })
        : cohortId
          ? await prisma.user.findMany({
              where: { organizationId, status: 'ACTIVE', cohortId },
              select: { id: true, fullName: true, role: true },
            })
          : await prisma.user.findMany({
              where: { organizationId, status: 'ACTIVE' },
              select: { id: true, fullName: true, role: true },
            })
    ) as BaseUser[];

    const users = search
      ? baseUsers.filter((u: BaseUser) => u.fullName.toLowerCase().includes(search.toLowerCase()))
      : baseUsers;

    // Build log map and records
    const logMap = new Map(filteredLogs.map((l: LogWithUser) => [l.userId, l]));

    const records = users.map((user: BaseUser) => {
      const log = logMap.get(user.id) ?? null;
      return {
        user: { id: user.id, fullName: user.fullName, role: user.role },
        log,
        status: log ? log.status : 'UNRESOLVED',
      };
    });

    // Summary counts
    const checkedIn = filteredLogs.filter(
      (l: LogWithUser) => l.status === 'ON_TIME' || l.status === 'EARLY',
    ).length;
    const late = filteredLogs.filter((l: LogWithUser) => l.status === 'LATE').length;
    const absent = users.length - logMap.size;
    const unresolved = records.filter((r: { status: string }) => r.status === 'UNRESOLVED').length;

    respond.success(res, {
      totalExpected: users.length,
      checkedIn,
      late,
      absent,
      unresolved,
      records,
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 2: GET /api/dashboard/supervisor/live -------------------------

export async function getLiveDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const todayDate = new Date(getTodayStr(orgTimezone) + 'T00:00:00.000Z');

    const scopedDeptId =
      userRole === Role.DEPARTMENT_SUPERVISOR ? await resolveSupervisorDeptId(userId) : undefined;

    const deptSelect = {
      id: true,
      name: true,
      _count: { select: { users: { where: { status: 'ACTIVE' } } } },
    } as const;

    const departments = (
      scopedDeptId
        ? await prisma.department.findMany({
            where: { organizationId, id: scopedDeptId },
            select: deptSelect,
          })
        : await prisma.department.findMany({
            where: { organizationId },
            select: deptSelect,
          })
    ) as DeptSummary[];

    // Get today's logs for relevant departments
    const deptIds = departments.map((d: DeptSummary) => d.id);
    const logs = (await prisma.attendanceLog.findMany({
      where: { organizationId, date: todayDate, departmentId: { in: deptIds } },
      select: { userId: true, departmentId: true, status: true },
    })) as SimpleLog[];

    // Group logs by department
    const logsByDept = new Map<string, SimpleLog[]>();
    for (const log of logs) {
      const arr = logsByDept.get(log.departmentId) ?? [];
      arr.push(log);
      logsByDept.set(log.departmentId, arr);
    }

    // Build department summaries
    const deptResults = departments.map((dept: DeptSummary) => {
      const deptLogs = logsByDept.get(dept.id) ?? [];
      const totalUsers = dept._count.users;
      const checkedIn = deptLogs.filter(
        (l: SimpleLog) => l.status === 'ON_TIME' || l.status === 'EARLY',
      ).length;
      const late = deptLogs.filter((l: SimpleLog) => l.status === 'LATE').length;
      const unresolved = totalUsers - deptLogs.length;

      return {
        id: dept.id,
        name: dept.name,
        totalUsers,
        checkedIn,
        late,
        unresolved,
      };
    });

    respond.success(res, {
      departments: deptResults,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 3: GET /api/dashboard/supervisor/export -----------------------

export async function exportAttendance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userRole = req.user!.role;
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const {
      startDate: startDateStr,
      endDate: endDateStr,
      departmentId: queryDeptId,
      cohortId,
      status,
    } = req.query as {
      startDate?: string;
      endDate?: string;
      departmentId?: string;
      cohortId?: string;
      status?: string;
    };

    if (!startDateStr || !endDateStr) {
      respond.error(res, 'startDate and endDate query params are required', 400);
      return;
    }

    const startDate = new Date(startDateStr + 'T00:00:00.000Z');
    const endDate = new Date(endDateStr + 'T00:00:00.000Z');

    const scopedDeptId =
      userRole === Role.DEPARTMENT_SUPERVISOR ? await resolveSupervisorDeptId(userId) : queryDeptId;

    const logInclude = {
      user: {
        select: {
          fullName: true,
          email: true,
          cohort: { select: { name: true } },
        },
      },
      department: { select: { name: true } },
    } as const;

    const logs = (
      scopedDeptId
        ? status
          ? await prisma.attendanceLog.findMany({
              where: {
                organizationId,
                date: { gte: startDate, lte: endDate },
                departmentId: scopedDeptId,
                status: status as AttendanceStatus,
              },
              include: logInclude,
              orderBy: [{ date: 'asc' }, { user: { fullName: 'asc' } }],
            })
          : await prisma.attendanceLog.findMany({
              where: {
                organizationId,
                date: { gte: startDate, lte: endDate },
                departmentId: scopedDeptId,
              },
              include: logInclude,
              orderBy: [{ date: 'asc' }, { user: { fullName: 'asc' } }],
            })
        : status
          ? await prisma.attendanceLog.findMany({
              where: {
                organizationId,
                date: { gte: startDate, lte: endDate },
                status: status as AttendanceStatus,
              },
              include: logInclude,
              orderBy: [{ date: 'asc' }, { user: { fullName: 'asc' } }],
            })
          : await prisma.attendanceLog.findMany({
              where: { organizationId, date: { gte: startDate, lte: endDate } },
              include: logInclude,
              orderBy: [{ date: 'asc' }, { user: { fullName: 'asc' } }],
            })
    ) as LogWithUserDept[];

    // Filter by cohort in-memory
    const cohortFiltered = cohortId
      ? logs.filter((l: LogWithUserDept) => l.user.cohort !== null)
      : logs;

    // Generate CSV
    const headers = [
      'Name',
      'Email',
      'Department',
      'Cohort',
      'Date',
      'Check-in Time',
      'Check-out Time',
      'Status',
      'Check-out Method',
      'Override Flag',
    ];

    const rows = cohortFiltered.map((log: LogWithUserDept) =>
      [
        escapeCsv(log.user.fullName),
        escapeCsv(log.user.email),
        escapeCsv(log.department.name),
        escapeCsv(log.user.cohort?.name ?? ''),
        escapeCsv(format(log.date, 'yyyy-MM-dd')),
        escapeCsv(log.checkInTime ? log.checkInTime.toISOString() : ''),
        escapeCsv(log.checkOutTime ? log.checkOutTime.toISOString() : ''),
        escapeCsv(log.status),
        escapeCsv(log.checkOutMethod ?? ''),
        escapeCsv(log.overriddenBy ? 'Yes' : 'No'),
      ].join(','),
    );

    const csv = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-${startDateStr}-${endDateStr}.csv"`,
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 4: GET /api/dashboard/personal --------------------------------

export async function getPersonalDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const organizationId = req.user!.organizationId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true, shiftStart: true, shiftEnd: true } },
        cohort: { select: { id: true, name: true, startDate: true } },
      },
    });

    if (!user) {
      respond.error(res, 'User not found', 404);
      return;
    }

    // Query schedule for grace period
    let gracePeriodMins = 15;
    if (user.department) {
      const schedule = await prisma.schedule.findUnique({
        where: {
          departmentId_userType: {
            departmentId: user.department.id,
            userType: user.role as Role,
          },
        },
      });
      if (schedule) gracePeriodMins = schedule.gracePeriodMins;
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const todayDateStr = getTodayStr(orgTimezone);
    const todayDate = new Date(todayDateStr + 'T00:00:00.000Z');

    // Today's log (findUnique - types work)
    const today = await prisma.attendanceLog.findUnique({
      where: { userId_date: { userId, date: todayDate } },
    });

    // Get holidays for streak and score (last 90 days)
    const ninetyDaysAgo = subDays(new Date(), 90);
    const holidays = (await prisma.holiday.findMany({
      where: { organizationId, date: { gte: ninetyDaysAgo } },
      select: { date: true },
    })) as { date: Date }[];
    const holidaySet = new Set(holidays.map((h: { date: Date }) => format(h.date, 'yyyy-MM-dd')));

    // Get attendance logs for streak (last 90 days)
    const recentLogs = (await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: ninetyDaysAgo, lte: todayDate } },
      orderBy: { date: 'desc' },
    })) as AnyLog[];

    // Calculate streak: consecutive ON_TIME/EARLY going back, skipping weekends/holidays
    // Start from yesterday when today has no check-in yet
    const logByDate = new Map(recentLogs.map((l: AnyLog) => [format(l.date, 'yyyy-MM-dd'), l]));
    let streak = 0;
    const hasTodayLog = logByDate.has(format(todayDate, 'yyyy-MM-dd'));
    let cursor = hasTodayLog ? todayDate : subDays(todayDate, 1);
    let counting = true;

    while (counting) {
      const cursorStr = format(cursor, 'yyyy-MM-dd');
      if (isWeekendDate(cursor) || holidaySet.has(cursorStr)) {
        cursor = subDays(cursor, 1);
        continue;
      }
      const log = logByDate.get(cursorStr);
      if (log && (log.status === 'ON_TIME' || log.status === 'EARLY')) {
        streak++;
        cursor = subDays(cursor, 1);
      } else {
        counting = false;
      }
    }

    // Calculate attendance score (60-day rolling window, excluding today)
    // Window start is max of: 60-day cap, cohort start, and user creation date
    const userCreatedAt = user.createdAt;
    const rawStartDate =
      user.role === Role.ATTACHEE && user.cohort ? user.cohort.startDate : subDays(todayDate, 30);
    const candidateDates = [subDays(todayDate, 60), rawStartDate, userCreatedAt].filter(
      Boolean,
    ) as Date[];
    const scoreStartDate = candidateDates.reduce((latest, d) => (d > latest ? d : latest));
    const scoreEndDate = subDays(todayDate, 1); // exclude today — hasn't happened yet

    const scoreLogs = (await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: scoreStartDate, lte: scoreEndDate } },
    })) as AnyLog[];

    const scoreDays = eachDayOfInterval({ start: scoreStartDate, end: scoreEndDate }).filter(
      (d: Date) => !isWeekendDate(d) && !holidaySet.has(format(d, 'yyyy-MM-dd')),
    );

    const onTimeDays = scoreLogs.filter(
      (l: AnyLog) => l.status === 'ON_TIME' || l.status === 'EARLY',
    ).length;
    const lateDays = scoreLogs.filter(
      (l: AnyLog) => l.status === 'LATE' || l.status === 'LEFT_EARLY',
    ).length;
    const absentDays = scoreDays.length - scoreLogs.length;
    const attendanceScore =
      scoreDays.length > 0 ? Math.round((onTimeDays / scoreDays.length) * 100) : 100;

    // This week
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const thisWeek = await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: weekStart, lte: weekEnd } },
      orderBy: { date: 'desc' },
    });

    // Recent history (last 30 days)
    const thirtyDaysAgo = subDays(new Date(), 30);
    const recentHistory = await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: thirtyDaysAgo, lte: todayDate } },
      orderBy: { date: 'desc' },
    });

    respond.success(res, {
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        department: user.department
          ? {
              id: user.department.id,
              name: user.department.name,
              shiftStart: user.department.shiftStart,
              shiftEnd: user.department.shiftEnd,
            }
          : null,
        cohort: user.cohort ? { id: user.cohort.id, name: user.cohort.name } : null,
      },
      today: today ?? null,
      streak,
      attendanceScore,
      attendanceBreakdown: {
        present: onTimeDays,
        late: lateDays,
        absent: absentDays,
        total: scoreDays.length,
      },
      thisWeek,
      recentHistory: recentHistory.map((log: AnyLog) => ({
        ...log,
        hours:
          log.checkInTime && log.checkOutTime
            ? Math.round(
                ((log.checkOutTime.getTime() - log.checkInTime.getTime()) / 3600000) * 100,
              ) / 100
            : null,
      })),
      gracePeriodMins,
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 5: GET /api/dashboard/supervisor/summary ----------------------

export async function getSupervisorSummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const organizationId = req.user!.organizationId;

    const {
      startDate: startDateStr,
      endDate: endDateStr,
      departmentId: queryDeptId,
    } = req.query as {
      startDate?: string;
      endDate?: string;
      departmentId?: string;
    };

    if (!startDateStr || !endDateStr) {
      respond.error(res, 'startDate and endDate query params are required', 400);
      return;
    }

    const startDate = new Date(startDateStr + 'T00:00:00.000Z');
    const endDate = new Date(endDateStr + 'T00:00:00.000Z');

    // Scope department for DEPARTMENT_SUPERVISOR
    const scopedDeptId =
      userRole === Role.DEPARTMENT_SUPERVISOR ? await resolveSupervisorDeptId(userId) : queryDeptId;

    // Get org holidays in range
    const holidays = (await prisma.holiday.findMany({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
      },
      select: { date: true },
    })) as { date: Date }[];
    const holidaySet = new Set(holidays.map((h: { date: Date }) => format(h.date, 'yyyy-MM-dd')));

    // Calculate total working days (exclude weekends + holidays)
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const workingDays = allDays.filter(
      (d: Date) => !isWeekendDate(d) && !holidaySet.has(format(d, 'yyyy-MM-dd')),
    );
    const totalWorkingDays = workingDays.length;

    // Fetch all attendance logs in range
    const logInclude = {
      user: {
        select: {
          id: true,
          fullName: true,
          role: true,
          cohort: { select: { name: true } },
        },
      },
    } as const;

    const logs = (
      scopedDeptId
        ? await prisma.attendanceLog.findMany({
            where: {
              organizationId,
              date: { gte: startDate, lte: endDate },
              departmentId: scopedDeptId,
            },
            include: logInclude,
          })
        : await prisma.attendanceLog.findMany({
            where: {
              organizationId,
              date: { gte: startDate, lte: endDate },
            },
            include: logInclude,
          })
    ) as SummaryLogRow[];

    // Group logs by userId
    const logsByUser = new Map<string, SummaryLogRow[]>();
    for (const log of logs) {
      const arr = logsByUser.get(log.userId) ?? [];
      arr.push(log);
      logsByUser.set(log.userId, arr);
    }

    // Build per-person summary
    const perPerson = Array.from(logsByUser.entries()).map(([uid, userLogs]) => {
      const firstLog = userLogs[0];
      const presentDays = userLogs.filter(
        (l: SummaryLogRow) =>
          l.status === 'ON_TIME' ||
          l.status === 'EARLY' ||
          l.status === 'LATE' ||
          l.status === 'LEFT_EARLY',
      ).length;
      const lateDays = userLogs.filter((l: SummaryLogRow) => l.status === 'LATE').length;
      const excusedDays = userLogs.filter(
        (l: SummaryLogRow) => l.status === 'ABSENT_EXCUSED',
      ).length;
      const absentDays = totalWorkingDays - presentDays - excusedDays;
      const attendanceRate =
        totalWorkingDays > 0 ? Math.round((presentDays / totalWorkingDays) * 100) : 0;

      return {
        user: {
          id: uid,
          fullName: firstLog.user.fullName,
          role: firstLog.user.role,
          cohort: firstLog.user.cohort,
        },
        presentDays,
        lateDays,
        absentDays: Math.max(0, absentDays),
        excusedDays,
        attendanceRate,
      };
    });

    // Department average
    const avgRate =
      perPerson.length > 0
        ? Math.round(perPerson.reduce((sum, p) => sum + p.attendanceRate, 0) / perPerson.length)
        : 0;

    respond.success(res, {
      dateRange: { start: startDateStr, end: endDateStr },
      totalWorkingDays,
      departmentAverage: avgRate,
      perPerson,
    });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 6: GET /api/dashboard/admin/review ---------------------------

export async function getAdminReviewItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const todayDateStr = getTodayStr(orgTimezone);
    const todayDate = new Date(todayDateStr + 'T00:00:00.000Z');

    // Get all supervisors
    const supervisors = await prisma.user.findMany({
      where: {
        organizationId,
        role: Role.DEPARTMENT_SUPERVISOR,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        departmentId: true,
      },
    });

    const supervisorIds = supervisors.map((s: { id: string }) => s.id);

    // Get today's attendance for supervisors
    const supervisorAttendance = await prisma.attendanceLog.findMany({
      where: {
        userId: { in: supervisorIds },
        date: todayDate,
      },
      select: {
        userId: true,
        status: true,
      },
    });

    const attendanceMap = new Map(
      supervisorAttendance.map((a: { userId: string; status: string }) => [a.userId, a.status]),
    );

    // Get unresolved disputes for supervisors
    const supervisorDisputes = await prisma.dispute.findMany({
      where: {
        userId: { in: supervisorIds },
        resolvedAt: null,
      },
      select: {
        id: true,
        userId: true,
        reason: true,
        createdAt: true,
      },
    });

    // Get pending leave requests for supervisors
    const supervisorLeaves = await prisma.leave.findMany({
      where: {
        userId: { in: supervisorIds },
        status: 'PENDING',
      },
      select: {
        id: true,
        userId: true,
        reason: true,
        startDate: true,
        createdAt: true,
      },
    });

    // Build unified list
    const issues: Array<{
      id: string;
      userId: string;
      fullName: string;
      role: string;
      type: 'attendance' | 'dispute' | 'leave';
      reason?: string;
      date?: string;
      createdAt: string;
    }> = [];

    for (const supervisor of supervisors) {
      const attendanceStatus = (attendanceMap.get(supervisor.id) ?? null) as string | null;

      // Attendance issues: Late, Unresolved, or Absent (no record)
      if (!attendanceStatus || attendanceStatus === 'LATE' || attendanceStatus === 'UNRESOLVED') {
        issues.push({
          id: `attendance-${supervisor.id}`,
          userId: supervisor.id,
          fullName: supervisor.fullName,
          role: supervisor.role,
          type: 'attendance',
          reason: !attendanceStatus ? 'No check-in record' : attendanceStatus,
          date: todayDate.toISOString(),
          createdAt: todayDate.toISOString(),
        });
      }

      // Disputes
      const userDisputes = supervisorDisputes.filter(
        (d: { userId: string }) => d.userId === supervisor.id,
      );
      for (const dispute of userDisputes) {
        issues.push({
          id: dispute.id,
          userId: supervisor.id,
          fullName: supervisor.fullName,
          role: supervisor.role,
          type: 'dispute',
          reason: dispute.reason,
          createdAt: dispute.createdAt.toISOString(),
        });
      }

      // Leave requests
      const userLeaves = supervisorLeaves.filter(
        (l: { userId: string }) => l.userId === supervisor.id,
      );
      for (const leave of userLeaves) {
        issues.push({
          id: leave.id,
          userId: supervisor.id,
          fullName: supervisor.fullName,
          role: supervisor.role,
          type: 'leave',
          reason: leave.reason,
          date: leave.startDate.toISOString(),
          createdAt: leave.createdAt.toISOString(),
        });
      }
    }

    respond.success(res, { issues });
  } catch (err) {
    next(err);
  }
}

// --- ENDPOINT 7: GET /api/dashboard/admin/escalated -------------------------

export async function getEscalatedItems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;

    // Disputes unresolved after 48 hours
    const fortyEightHoursAgo = subHours(new Date(), 48);
    const escalatedDisputes = await prisma.dispute.findMany({
      where: {
        resolvedAt: null,
        createdAt: { lte: fortyEightHoursAgo },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            organizationId: true,
          },
        },
      },
    });

    // Leave requests pending for more than 3 business days
    // Simplified: use 72 hours for now (3 business days would need holiday calculation)
    const seventyTwoHoursAgo = subHours(new Date(), 72);
    const escalatedLeaves = await prisma.leave.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lte: seventyTwoHoursAgo },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            organizationId: true,
          },
        },
      },
    });

    const issues: Array<{
      id: string;
      userId: string;
      fullName: string;
      role: string;
      type: 'dispute' | 'leave';
      reason?: string;
      date?: string;
      createdAt: string;
    }> = [];

    for (const dispute of escalatedDisputes) {
      if (dispute.user.organizationId === organizationId) {
        issues.push({
          id: dispute.id,
          userId: dispute.userId,
          fullName: dispute.user.fullName,
          role: dispute.user.role,
          type: 'dispute',
          reason: dispute.reason,
          createdAt: dispute.createdAt.toISOString(),
        });
      }
    }

    for (const leave of escalatedLeaves) {
      if (leave.user.organizationId === organizationId) {
        issues.push({
          id: leave.id,
          userId: leave.userId,
          fullName: leave.user.fullName,
          role: leave.user.role,
          type: 'leave',
          reason: leave.reason,
          date: leave.startDate.toISOString(),
          createdAt: leave.createdAt.toISOString(),
        });
      }
    }

    respond.success(res, { issues });
  } catch (err) {
    next(err);
  }
}

export async function getOverviewLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) return respond.error(res, 'User not found', 404);

    const orgId = user.organizationId;
    const { startDate, endDate, departmentId, status, cohortId, search } = req.query as Record<
      string,
      string | undefined
    >;

    const start = startDate ? new Date(startDate) : subDays(new Date(), 6);
    const end = endDate ? new Date(endDate) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const where: Prisma.AttendanceLogWhereInput = {
      organizationId: orgId,
      date: { gte: start, lte: end },
    };
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status as AttendanceStatus;
    if (cohortId || search) {
      const userWhere: Prisma.UserWhereInput = {};
      if (cohortId) userWhere.cohortId = cohortId;
      if (search) userWhere.fullName = { contains: search, mode: 'insensitive' };
      where.user = userWhere;
    }

    const logs = await prisma.attendanceLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            role: true,
            cohort: { select: { id: true, name: true } },
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            supervisor: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { user: { fullName: 'asc' } }],
    });

    respond.success(res, { logs });
  } catch (err) {
    next(err);
  }
}
