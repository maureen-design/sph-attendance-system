import cron from 'node-cron';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import prisma from '../db/prisma.js';
import { config } from '../config/env.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getZonedNow(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}

function getTodayDate(timezone: string): Date {
  const zoned = getZonedNow(timezone);
  return new Date(format(zoned, 'yyyy-MM-dd') + 'T00:00:00.000Z');
}

function logJob(jobName: string, message: string): void {
  if (config.isDev) {
    console.log(`[${new Date().toISOString()}] [job:${jobName}] ${message}`);
  }
}

// ─── Type shapes for findMany results ───────────────────────────────────────

type ScheduleRow = {
  userType: string;
  cutoffTime: string;
};

type UserRow = {
  id: string;
  fullName: string;
  departmentId: string;
};

type DeptRow = {
  id: string;
  name: string;
  shiftEnd: string;
  organizationId: string;
  timezone: string;
};

type OrgRow = {
  id: string;
  timezone: string;
};

type LogRow = {
  id: string;
  userId: string;
  departmentId: string;
  date: Date;
  checkOutTime: Date | null;
};

type DeptForAutoClose = {
  id: string;
  shiftEnd: string;
  timezone: string;
};

// ─── JOB 1: Cutoff checker (every 5 minutes) ───────────────────────────────

async function cutoffChecker(): Promise<void> {
  try {
    logJob('cutoff', 'Running cutoff check...');

    const orgs = (await prisma.organization.findMany({
      select: { id: true, timezone: true },
    })) as OrgRow[];

    for (const org of orgs) {
      const now = getZonedNow(org.timezone);
      const todayDate = getTodayDate(org.timezone);
      const nowMins = now.getHours() * 60 + now.getMinutes();

      const departments = (await prisma.department.findMany({
        where: { organizationId: org.id },
        select: { id: true, name: true },
      })) as { id: string; name: string }[];

      for (const dept of departments) {
        const schedules = (await prisma.schedule.findMany({
          where: { departmentId: dept.id },
          select: { userType: true, cutoffTime: true },
        })) as ScheduleRow[];

        for (const schedule of schedules) {
          const [h, m] = schedule.cutoffTime.split(':').map(Number);
          const cutoffMins = h * 60 + m;

          if (nowMins > cutoffMins) {
            const users = (await prisma.user.findMany({
              where: {
                departmentId: dept.id,
                isActive: true,
                role: schedule.userType as never,
              },
              select: { id: true, fullName: true, departmentId: true },
            })) as UserRow[];

            const unresolvedNames: string[] = [];

            for (const user of users) {
              const existing = await prisma.attendanceLog.findUnique({
                where: { userId_date: { userId: user.id, date: todayDate } },
              });

              if (!existing) {
                await prisma.attendanceLog.create({
                  data: {
                    userId: user.id,
                    organizationId: org.id,
                    departmentId: dept.id,
                    date: todayDate,
                    status: 'UNRESOLVED',
                  },
                });
                unresolvedNames.push(user.fullName);
              }
            }

            if (unresolvedNames.length > 0) {
              const supervisors = (await prisma.user.findMany({
                where: {
                  organizationId: org.id,
                  OR: [{ supervisedDept: { some: { id: dept.id } } }, { role: 'SUPER_ADMIN' }],
                },
                select: { id: true },
              })) as { id: string }[];

              for (const sup of supervisors) {
                await prisma.notification.create({
                  data: {
                    userId: sup.id,
                    title: 'Cutoff Alert',
                    body: `${unresolvedNames.length} people unresolved in ${dept.name} as of ${schedule.cutoffTime}`,
                    type: 'CUTOFF_ALERT',
                  },
                });
              }
            }
          }
        }
      }
    }

    logJob('cutoff', 'Cutoff check complete.');
  } catch (err) {
    console.error(`[job:cutoff] Error: ${(err as Error).message}`);
  }
}

// ─── JOB 2: Checkout reminder (every 5 minutes) ─────────────────────────────

async function checkoutReminder(): Promise<void> {
  try {
    logJob('reminder', 'Running checkout reminders...');

    const departments = (await prisma.department.findMany({
      include: { organization: { select: { timezone: true } } },
    })) as DeptRow[];

    for (const dept of departments) {
      const now = getZonedNow(dept.timezone);
      const nowMins = now.getHours() * 60 + now.getMinutes();

      const [endH, endM] = dept.shiftEnd.split(':').map(Number);
      const shiftEndMins = endH * 60 + endM;
      const diff = shiftEndMins - nowMins;

      // Only notify when 25-35 mins before shift end
      if (diff < 25 || diff > 35) continue;

      const todayDate = getTodayDate(dept.timezone);

      const users = (await prisma.user.findMany({
        where: { departmentId: dept.id, isActive: true },
        select: { id: true, fullName: true, departmentId: true },
      })) as UserRow[];

      let count = 0;
      for (const user of users) {
        const log = await prisma.attendanceLog.findUnique({
          where: { userId_date: { userId: user.id, date: todayDate } },
        });

        if (log && log.checkInTime && !log.checkOutTime) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              title: 'Checkout Reminder',
              body: `Don't forget to check out before ${dept.shiftEnd}`,
              type: 'CHECKOUT_REMINDER',
            },
          });
          count++;
        }
      }

      if (count > 0) {
        logJob('reminder', `Sent ${count} reminders for ${dept.name}`);
      }
    }

    logJob('reminder', 'Checkout reminders complete.');
  } catch (err) {
    console.error(`[job:reminder] Error: ${(err as Error).message}`);
  }
}

// ─── JOB 3: Auto-close checkouts (midnight Africa/Nairobi) ─────────────────

async function autoCloseCheckouts(): Promise<void> {
  try {
    logJob('auto-close', 'Running auto-close checkouts...');

    const orgs = (await prisma.organization.findMany({
      select: { id: true, timezone: true },
    })) as OrgRow[];

    let totalClosed = 0;

    for (const org of orgs) {
      const zonedNow = getZonedNow(org.timezone);
      const yesterday = subDays(zonedNow, 1);
      const yesterdayStr = format(yesterday, 'yyyy-MM-dd');
      const yesterdayDate = new Date(yesterdayStr + 'T00:00:00.000Z');

      const logs = (await prisma.attendanceLog.findMany({
        where: {
          organizationId: org.id,
          date: yesterdayDate,
          checkOutTime: null,
        },
        select: { id: true, userId: true, departmentId: true, date: true },
      })) as LogRow[];

      for (const log of logs) {
        const dept = (await prisma.department.findUnique({
          where: { id: log.departmentId },
          select: { shiftEnd: true, timezone: true },
        })) as DeptForAutoClose | null;

        if (!dept) continue;

        const [endH, endM] = dept.shiftEnd.split(':').map(Number);
        const checkOutUtc = new Date(yesterdayStr + 'T00:00:00.000Z');
        checkOutUtc.setUTCHours(endH, endM, 0, 0);

        await prisma.attendanceLog.update({
          where: { id: log.id },
          data: {
            checkOutTime: checkOutUtc,
            checkOutMethod: 'AUTO_CLOSED',
          },
        });

        await prisma.notification.create({
          data: {
            userId: log.userId,
            title: 'Checkout Auto-Closed',
            body: `Your checkout was auto-closed at ${dept.shiftEnd}`,
            type: 'AUTO_CLOSE',
          },
        });

        totalClosed++;
      }
    }

    logJob('auto-close', `Auto-closed ${totalClosed} checkouts.`);
  } catch (err) {
    console.error(`[job:auto-close] Error: ${(err as Error).message}`);
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

export function startJobs(): void {
  if (config.NODE_ENV === 'test') return;

  // Cutoff checker — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    void cutoffChecker();
  });

  // Checkout reminder — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    void checkoutReminder();
  });

  // Auto-close — midnight Africa/Nairobi
  cron.schedule(
    '0 0 * * *',
    () => {
      void autoCloseCheckouts();
    },
    { timezone: 'Africa/Nairobi' },
  );

  logJob('scheduler', 'All jobs scheduled.');
}
