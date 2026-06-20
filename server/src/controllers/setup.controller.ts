import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { hashPassword } from '../utils/hash.js';
import * as respond from '../utils/response.js';

// --- Validation helpers -----------------------------------------------------

function validateSetup(body: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!body.orgName || typeof body.orgName !== 'string') errors.push('orgName is required');
  if (!body.orgShortName || typeof body.orgShortName !== 'string')
    errors.push('orgShortName is required');
  if (!body.orgEmail || typeof body.orgEmail !== 'string') errors.push('orgEmail is required');
  if (!body.adminFullName || typeof body.adminFullName !== 'string')
    errors.push('adminFullName is required');
  if (!body.adminEmail || typeof body.adminEmail !== 'string')
    errors.push('adminEmail is required');
  if (!body.adminPassword || typeof body.adminPassword !== 'string')
    errors.push('adminPassword is required');
  return errors;
}

// --- GET /api/setup/status --------------------------------------------------

export async function getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await prisma.organization.count();
    respond.success(res, { setupRequired: count === 0 });
  } catch (err) {
    next(err);
  }
}

// --- POST /api/setup --------------------------------------------------------

export async function setup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Guard: only works if no org exists
    const count = await prisma.organization.count();
    if (count > 0) {
      respond.error(res, 'Setup already completed', 403);
      return;
    }

    const fieldErrors = validateSetup(req.body as Record<string, unknown>);
    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const { orgName, orgShortName, orgEmail, adminFullName, adminEmail, adminPassword } =
      req.body as {
        orgName: string;
        orgShortName: string;
        orgEmail: string;
        adminFullName: string;
        adminEmail: string;
        adminPassword: string;
        timezone?: string;
      };

    const timezone = (req.body as Record<string, unknown>).timezone as string | undefined;
    const passwordHash = await hashPassword(adminPassword);

    // Create org, admin, audit log sequentially with rollback on failure
    let orgId: string | undefined;
    let adminId: string | undefined;

    try {
      const org = await prisma.organization.create({
        data: {
          name: orgName,
          shortName: orgShortName,
          email: orgEmail,
          timezone: timezone ?? 'Africa/Nairobi',
        },
      });
      orgId = org.id;

      const admin = await prisma.user.create({
        data: {
          fullName: adminFullName,
          email: adminEmail,
          passwordHash,
          role: 'SUPER_ADMIN',
          organizationId: org.id,
          isActive: true,
        },
      });
      adminId = admin.id;

      await prisma.auditLog.create({
        data: {
          organizationId: org.id,
          actorId: admin.id,
          action: 'ORGANIZATION_CREATED',
          tableName: 'Organization',
          recordId: org.id,
          ipAddress: req.ip ?? null,
          userAgent: req.headers['user-agent'] ?? null,
        },
      });

      respond.success(
        res,
        {
          message: 'Setup complete',
          organization: { id: org.id, name: org.name, shortName: org.shortName },
          admin: {
            id: admin.id,
            fullName: admin.fullName,
            email: admin.email,
            role: admin.role,
          },
        },
        201,
      );
    } catch (createErr) {
      // Rollback: clean up partial data
      if (adminId) {
        await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
      }
      if (orgId) {
        await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
      }
      throw createErr;
    }
  } catch (err) {
    next(err);
  }
}

// --- POST /api/setup/departments --------------------------------------------

interface DepartmentInput {
  name: string;
  shiftStart: string;
  shiftEnd: string;
  timezone?: string;
}

const DEFAULT_SCHEDULES = [
  { userType: 'ATTACHEE' as const, cutoffTime: '10:00', gracePeriodMins: 15 },
  { userType: 'MEMBER' as const, cutoffTime: '09:30', gracePeriodMins: 15 },
  { userType: 'STAFF' as const, cutoffTime: '09:00', gracePeriodMins: 15 },
];

export async function createDepartments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { departments } = req.body as { departments?: DepartmentInput[] };

    if (!Array.isArray(departments) || departments.length === 0) {
      respond.error(res, 'departments array is required and must not be empty', 400);
      return;
    }

    // Validate each item
    const fieldErrors: string[] = [];
    departments.forEach((d, i) => {
      if (!d.name) fieldErrors.push(`departments[${i}].name is required`);
      if (!d.shiftStart) fieldErrors.push(`departments[${i}].shiftStart is required`);
      if (!d.shiftEnd) fieldErrors.push(`departments[${i}].shiftEnd is required`);
    });

    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const organizationId = req.user!.organizationId;

    // Get org timezone as default
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const defaultTimezone = org?.timezone ?? 'Africa/Nairobi';

    const created = [];
    for (const dept of departments) {
      const department = await prisma.department.create({
        data: {
          name: dept.name,
          shiftStart: dept.shiftStart,
          shiftEnd: dept.shiftEnd,
          timezone: dept.timezone ?? defaultTimezone,
          organizationId,
        },
      });

      // Create default schedules for each user type
      for (const schedule of DEFAULT_SCHEDULES) {
        await prisma.schedule.create({
          data: {
            departmentId: department.id,
            userType: schedule.userType,
            cutoffTime: schedule.cutoffTime,
            gracePeriodMins: schedule.gracePeriodMins,
          },
        });
      }

      created.push(department);
    }

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: req.user!.id,
        action: 'DEPARTMENTS_CREATED',
        tableName: 'Department',
        recordId: organizationId,
        reason: `Created ${created.length} departments`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(
      res,
      {
        departments: created.map((d) => ({
          id: d.id,
          name: d.name,
          shiftStart: d.shiftStart,
          shiftEnd: d.shiftEnd,
        })),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

// --- POST /api/setup/cohort -------------------------------------------------

export async function createCohort(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, startDate, endDate, departmentIds } = req.body as {
      name?: string;
      startDate?: string;
      endDate?: string;
      departmentIds?: string[];
    };

    const fieldErrors: string[] = [];
    if (!name || typeof name !== 'string') fieldErrors.push('name is required');
    if (!startDate) fieldErrors.push('startDate is required');
    if (!endDate) fieldErrors.push('endDate is required');

    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const organizationId = req.user!.organizationId;

    const cohort = await prisma.cohort.create({
      data: {
        name: name!,
        startDate: new Date(startDate!),
        endDate: new Date(endDate!),
        organizationId,
        isActive: true,
      },
    });

    const inviteLinks = [];

    // General cohort invite link (no department restriction)
    const generalLink = await prisma.inviteLink.create({
      data: {
        token: crypto.randomBytes(32).toString('hex'),
        cohortId: cohort.id,
        expiresAt: cohort.startDate,
        maxUses: 999,
        usedCount: 0,
      },
    });
    inviteLinks.push(generalLink);

    // Per-department invite links
    if (Array.isArray(departmentIds) && departmentIds.length > 0) {
      for (const deptId of departmentIds) {
        const deptLink = await prisma.inviteLink.create({
          data: {
            token: crypto.randomBytes(32).toString('hex'),
            cohortId: cohort.id,
            departmentId: deptId,
            expiresAt: cohort.startDate,
            maxUses: 999,
            usedCount: 0,
          },
        });
        inviteLinks.push(deptLink);
      }
    }

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: req.user!.id,
        action: 'COHORT_CREATED',
        tableName: 'Cohort',
        recordId: cohort.id,
        reason: `Cohort "${cohort.name}" with ${inviteLinks.length} invite links`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(
      res,
      {
        cohort: {
          id: cohort.id,
          name: cohort.name,
          startDate: cohort.startDate,
          endDate: cohort.endDate,
        },
        inviteLinks: inviteLinks.map((link) => ({
          token: link.token,
          departmentId: link.departmentId,
          expiresAt: link.expiresAt,
        })),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}
