import 'dotenv/config';
import { PrismaClient, Role, AttendanceStatus, CheckInMethod, CheckOutMethod } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const ROUNDS = 12;

function hash(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function makeTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Cleaning existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.readReceipt.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.workLog.deleteMany();
  await prisma.attendanceLog.deleteMany();
  await prisma.inviteLink.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.cohort.deleteMany();
  await prisma.department.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.organization.deleteMany();

  // 1) Organization
  console.log('Creating organization...');
  const org = await prisma.organization.create({
    data: {
      name: 'Swahilipot Hub',
      shortName: 'SPH',
      email: 'admin@sphattendance.com',
      timezone: 'Africa/Nairobi',
    },
  });

  // 2) Departments
  console.log('Creating departments...');
  const deptData = [
    { name: 'Tech', shiftStart: '08:00', shiftEnd: '17:00' },
    { name: 'Communication', shiftStart: '08:30', shiftEnd: '17:30' },
    { name: 'Creatives', shiftStart: '09:00', shiftEnd: '18:00' },
    { name: 'Youth Engagement', shiftStart: '08:00', shiftEnd: '16:30' },
    { name: 'Administration', shiftStart: '08:00', shiftEnd: '17:00' },
  ];

  const departments = await Promise.all(
    deptData.map((d) =>
      prisma.department.create({
        data: { ...d, organizationId: org.id },
      }),
    ),
  );

  // 3) Cohorts
  console.log('Creating cohorts...');
  const cohort1 = await prisma.cohort.create({
    data: {
      name: 'SPH 001 2026',
      organizationId: org.id,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
    },
  });

  const cohort2 = await prisma.cohort.create({
    data: {
      name: 'SPH 002 2026',
      organizationId: org.id,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-09-30'),
    },
  });

  const defaultPassword = 'Password123!';
  const defaultHash = await hash(defaultPassword);

  // 4) SUPER_ADMIN
  console.log('Creating users...');
  const admin = await prisma.user.create({
    data: {
      fullName: 'Maureen Admin',
      email: 'maureen@sphattendance.com',
      role: Role.SUPER_ADMIN,
      organizationId: org.id,
      passwordHash: defaultHash,
      isActive: true,
    },
  });

  // 5) DEPARTMENT_SUPERVISORs (one per department)
  const supervisorData = [
    { fullName: 'Alice Tech', email: 'alice.tech@sphattendance.com', dept: 0 },
    { fullName: 'Bob Comms', email: 'bob.comms@sphattendance.com', dept: 1 },
    { fullName: 'Carol Creative', email: 'carol.creative@sphattendance.com', dept: 2 },
    { fullName: 'Dave Youth', email: 'dave.youth@sphattendance.com', dept: 3 },
    { fullName: 'Eve Admin', email: 'eve.admin@sphattendance.com', dept: 4 },
  ];

  const supervisors = await Promise.all(
    supervisorData.map((s) =>
      prisma.user.create({
        data: {
          fullName: s.fullName,
          email: s.email,
          role: Role.DEPARTMENT_SUPERVISOR,
          organizationId: org.id,
          departmentId: departments[s.dept].id,
          passwordHash: defaultHash,
          isActive: true,
        },
      }),
    ),
  );

  // Assign supervisors to their departments
  await Promise.all(
    departments.map((dept, i) =>
      prisma.department.update({
        where: { id: dept.id },
        data: { supervisorId: supervisors[i].id },
      }),
    ),
  );

  // 6) STAFF
  const staffUsers = await Promise.all(
    [
      { fullName: 'Frank Staff', email: 'frank.staff@sphattendance.com', dept: 0, cohort: cohort1.id },
      { fullName: 'Grace Staff', email: 'grace.staff@sphattendance.com', dept: 1, cohort: cohort2.id },
    ].map((s) =>
      prisma.user.create({
        data: {
          fullName: s.fullName,
          email: s.email,
          role: Role.STAFF,
          organizationId: org.id,
          departmentId: departments[s.dept].id,
          cohortId: s.cohort,
          passwordHash: defaultHash,
          isActive: true,
        },
      }),
    ),
  );

  // 7) ATTACHEES
  const attacheeData = [
    { fullName: 'Hannah Attachee', email: 'hannah.att@sphattendance.com', dept: 0, cohort: cohort1.id },
    { fullName: 'Ian Attachee', email: 'ian.att@sphattendance.com', dept: 0, cohort: cohort1.id },
    { fullName: 'Julia Attachee', email: 'julia.att@sphattendance.com', dept: 2, cohort: cohort2.id },
    { fullName: 'Kevin Attachee', email: 'kevin.att@sphattendance.com', dept: 3, cohort: cohort2.id },
    { fullName: 'Liam Attachee', email: 'liam.att@sphattendance.com', dept: 4, cohort: cohort1.id },
  ];

  const attachees = await Promise.all(
    attacheeData.map((a) =>
      prisma.user.create({
        data: {
          fullName: a.fullName,
          email: a.email,
          role: Role.ATTACHEE,
          organizationId: org.id,
          departmentId: departments[a.dept].id,
          cohortId: a.cohort,
          passwordHash: defaultHash,
          isActive: true,
        },
      }),
    ),
  );

  const allUsers = [admin, ...supervisors, ...staffUsers, ...attachees];

  // 8) Schedules for each department
  console.log('Creating schedules...');
  await Promise.all(
    departments.flatMap((dept) =>
      [Role.STAFF, Role.ATTACHEE].map((userType) =>
        prisma.schedule.create({
          data: {
            departmentId: dept.id,
            userType,
            cutoffTime: dept.shiftStart,
            gracePeriodMins: 15,
          },
        }),
      ),
    ),
  );

  // 9) Attendance logs — spread across past 7 days
  console.log('Creating attendance logs...');

  const nonAdminUsers = [...supervisors, ...staffUsers, ...attachees];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = daysAgo(dayOffset);

    for (const user of nonAdminUsers) {
      // Skip weekends (Sat=6, Sun=0)
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;

      // Not every user has a log every day — ~80% attendance rate
      if (Math.random() > 0.8) continue;

      const statusRoll = Math.random();
      let status: AttendanceStatus;
      if (statusRoll < 0.55) status = 'ON_TIME';
      else if (statusRoll < 0.70) status = 'LATE';
      else if (statusRoll < 0.80) status = 'EARLY';
      else if (statusRoll < 0.88) status = 'LEFT_EARLY';
      else if (statusRoll < 0.94) status = 'UNRESOLVED';
      else status = 'ABSENT_UNEXCUSED';

      const isPresent = ['ON_TIME', 'LATE', 'EARLY', 'LEFT_EARLY'].includes(status);

      const checkInHour = status === 'EARLY' ? 7 : status === 'LATE' ? 9 : 8;
      const checkInMin = Math.floor(Math.random() * 30);

      const checkOutHour = 16 + Math.floor(Math.random() * 2);
      const checkOutMin = Math.floor(Math.random() * 60);

      await prisma.attendanceLog.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          departmentId: user.departmentId!,
          date,
          status,
          checkInTime: isPresent ? makeTime(date, checkInHour, checkInMin) : null,
          checkOutTime: isPresent && Math.random() > 0.2 ? makeTime(date, checkOutHour, checkOutMin) : null,
          checkInMethod: isPresent ? CheckInMethod.QR : null,
          checkOutMethod: isPresent && Math.random() > 0.2 ? CheckOutMethod.SCANNED : null,
        },
      });
    }
  }

  // 10) Some disputes for testing
  console.log('Creating disputes...');
  const unresolvedLogs = await prisma.attendanceLog.findMany({
    where: { status: 'UNRESOLVED' },
    take: 2,
  });

  for (const log of unresolvedLogs) {
    await prisma.dispute.create({
      data: {
        attendanceLogId: log.id,
        userId: log.userId,
        reason: 'I was on time, the system did not register my check-in correctly.',
      },
    });
  }

  console.log('Seed complete!');
  console.log(`  Organization: ${org.name} (${org.shortName})`);
  console.log(`  Departments: ${departments.length}`);
  console.log(`  Cohorts: 2`);
  console.log(`  Users: ${allUsers.length}`);
  console.log(`  Attendance logs: created for 7 days`);
  console.log('');
  console.log('Default login password for all users: Password123!');
  console.log('  Admin: maureen@sphattendance.com');
  console.log('  Supervisors: alice.tech@, bob.comms@, carol.creative@, dave.youth@, eve.admin@');
  console.log('  Staff: frank.staff@, grace.staff@');
  console.log('  Attachees: hannah.att@, ian.att@, julia.att@, kevin.att@, liam.att@');
  console.log('  (all @sphattendance.com)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
