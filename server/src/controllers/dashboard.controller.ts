import { Role, type AttendanceStatus } from '@prisma/client';
import { format, subDays, eachDayOfInterval, isWeekend, startOfWeek, endOfWeek } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import * as respond from '../utils/response.js';

// ─── Type aliases for findMany results (Prisma v6 type workaround) ──────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── ENDPOINT 1: GET /api/dashboard/supervisor ──────────────────────────────

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

    // Fetch logs — explicit branches avoid spread breaking Prisma type inference
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
              where: { organizationId, isActive: true, departmentId: scopedDeptId, cohortId },
              select: { id: true, fullName: true, role: true },
            })
          : await prisma.user.findMany({
              where: { organizationId, isActive: true, departmentId: scopedDeptId },
              select: { id: true, fullName: true, role: true },
            })
        : cohortId
          ? await prisma.user.findMany({
              where: { organizationId, isActive: true, cohortId },
              select: { id: true, fullName: true, role: true },
            })
          : await prisma.user.findMany({
              where: { organizationId, isActive: true },
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

// ─── ENDPOINT 2: GET /api/dashboard/supervisor/live ─────────────────────────

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
      _count: { select: { users: { where: { isActive: true } } } },
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

// ─── ENDPOINT 3: GET /api/dashboard/supervisor/export ───────────────────────

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

// ─── ENDPOINT 4: GET /api/dashboard/personal ────────────────────────────────

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
        department: { select: { id: true, name: true } },
        cohort: { select: { id: true, name: true, startDate: true } },
      },
    });

    if (!user) {
      respond.error(res, 'User not found', 404);
      return;
    }

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone ?? 'Africa/Nairobi';
    const todayDateStr = getTodayStr(orgTimezone);
    const todayDate = new Date(todayDateStr + 'T00:00:00.000Z');

    // Today's log (findUnique — types work)
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
    const logByDate = new Map(recentLogs.map((l: AnyLog) => [format(l.date, 'yyyy-MM-dd'), l]));
    let streak = 0;
    let cursor = todayDate;
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

    // Calculate attendance score
    const scoreStartDate =
      user.role === Role.ATTACHEE && user.cohort ? user.cohort.startDate : subDays(new Date(), 30);

    const scoreLogs = (await prisma.attendanceLog.findMany({
      where: { userId, date: { gte: scoreStartDate, lte: todayDate } },
    })) as AnyLog[];

    const scoreDays = eachDayOfInterval({ start: scoreStartDate, end: todayDate }).filter(
      (d: Date) => !isWeekendDate(d) && !holidaySet.has(format(d, 'yyyy-MM-dd')),
    );

    const onTimeDays = scoreLogs.filter(
      (l: AnyLog) => l.status === 'ON_TIME' || l.status === 'EARLY',
    ).length;
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
        department: user.department ? { id: user.department.id, name: user.department.name } : null,
      },
      today: today ?? null,
      streak,
      attendanceScore,
      thisWeek,
      recentHistory,
    });
  } catch (err) {
    next(err);
  }
}
