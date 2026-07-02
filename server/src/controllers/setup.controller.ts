import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma.js';
import { hashPassword } from '../utils/hash.js';
import * as respond from '../utils/response.js';

// --- Admin setup wizard endpoints ----------------------------------------------

// --- POST /api/setup/organization ----------------------------------------------

export async function createOrganization(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, timezone, logoUrl } = req.body as {
      name?: string;
      timezone?: string;
      logoUrl?: string;
    };

    const fieldErrors: string[] = [];
    if (!name || typeof name !== 'string') fieldErrors.push('name is required');
    if (!timezone || typeof timezone !== 'string') fieldErrors.push('timezone is required');

    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const organizationId = req.user!.organizationId;

    // Check if organization exists (update) or create new
    // During first-time setup, organizationId may be null
    let existing = null;
    if (organizationId) {
      existing = await prisma.organization.findUnique({
        where: { id: organizationId },
      });
    }

    let org;
    if (existing) {
      org = await prisma.organization.update({
        where: { id: organizationId },
        data: {
          name: name!,
          timezone: timezone!,
          logoUrl: logoUrl ?? null,
        },
      });
    } else {
      const shortName =
        name!.length > 10 ? name!.substring(0, 10).toUpperCase() : name!.toUpperCase();
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true },
      });
      org = await prisma.organization.create({
        data: {
          name: name!,
          shortName,
          email: user!.email,
          timezone: timezone!,
          logoUrl: logoUrl ?? null,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        actorId: req.user!.id,
        action: existing ? 'ORGANIZATION_UPDATED' : 'ORGANIZATION_CREATED',
        tableName: 'Organization',
        recordId: org.id,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(
      res,
      {
        organization: {
          id: org.id,
          name: org.name,
          shortName: org.shortName,
          timezone: org.timezone,
          logoUrl: org.logoUrl,
        },
      },
      existing ? 200 : 201,
    );
  } catch (err) {
    next(err);
  }
}

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
          status: 'ACTIVE',
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
  supervisorId?: string;
  gracePeriod?: number;
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
      if (!d.name || typeof d.name !== 'string')
        fieldErrors.push(`departments[${i}].name is required`);
      if (!d.shiftStart) fieldErrors.push(`departments[${i}].shiftStart is required`);
      if (!d.shiftEnd) fieldErrors.push(`departments[${i}].shiftEnd is required`);

      // Validate shiftStart < shiftEnd
      if (d.shiftStart && d.shiftEnd) {
        const [startH, startM] = d.shiftStart.split(':').map(Number);
        const [endH, endM] = d.shiftEnd.split(':').map(Number);
        const startMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;
        if (startMins >= endMins) {
          fieldErrors.push(`departments[${i}].shiftStart must be before shiftEnd`);
        }
      }

      // Validate grace period
      if (d.gracePeriod !== undefined) {
        if (typeof d.gracePeriod !== 'number' || d.gracePeriod < 0 || d.gracePeriod > 60) {
          fieldErrors.push(`departments[${i}].gracePeriod must be between 0 and 60`);
        }
      }
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

    const created: Array<{ id: string; name: string; shiftStart: string; shiftEnd: string }> = [];
    const failed: { index: number; name: string; error: string }[] = [];

    // Use transaction for atomicity
    await prisma.$transaction(async (_tx) => {
      for (let i = 0; i < departments.length; i++) {
        const dept = departments[i];
        try {
          const department = await prisma.department.create({
            data: {
              name: dept.name,
              shiftStart: dept.shiftStart,
              shiftEnd: dept.shiftEnd,
              timezone: dept.timezone ?? defaultTimezone,
              organizationId,
            },
          });

          // Assign supervisor if provided
          if (dept.supervisorId) {
            await prisma.user.update({
              where: { id: dept.supervisorId },
              data: { departmentId: department.id },
            });
          }

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
        } catch (err) {
          failed.push({
            index: i,
            name: dept.name,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    });

    // If any failed, return partial success with details
    if (failed.length > 0) {
      respond.error(
        res,
        `Failed to create ${failed.length} department(s): ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`,
        207, // Multi-status
      );
      return;
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
        maxUses: 1,
        isActive: true,
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
            maxUses: 1,
            isActive: true,
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

// --- POST /api/setup/cohorts (bulk) -----------------------------------------

interface CohortInput {
  name: string;
  startDate: string;
  endDate: string;
  departmentIds?: string[];
}

export async function createCohorts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { cohorts } = req.body as { cohorts?: CohortInput[] };

    if (!Array.isArray(cohorts) || cohorts.length === 0) {
      respond.error(res, 'cohorts array is required and must not be empty', 400);
      return;
    }

    // Validate each item
    const fieldErrors: string[] = [];
    cohorts.forEach((c, i) => {
      if (!c.name || typeof c.name !== 'string') fieldErrors.push(`cohorts[${i}].name is required`);
      if (!c.startDate) fieldErrors.push(`cohorts[${i}].startDate is required`);
      if (!c.endDate) fieldErrors.push(`cohorts[${i}].endDate is required`);

      //.Validate date range
      if (c.startDate && c.endDate) {
        const start = new Date(c.startDate);
        const end = new Date(c.endDate);
        if (start >= end) {
          fieldErrors.push(`cohorts[${i}].startDate must be before endDate`);
        }
      }
    });

    if (fieldErrors.length > 0) {
      respond.error(res, fieldErrors.join(', '), 400);
      return;
    }

    const organizationId = req.user!.organizationId;

    const created: Array<{ id: string; name: string; startDate: Date; endDate: Date }> = [];
    const failed: { index: number; name: string; error: string }[] = [];

    // Use transaction for atomicity
    await prisma.$transaction(async (_tx) => {
      for (let i = 0; i < cohorts.length; i++) {
        const cohortData = cohorts[i];
        try {
          const cohort = await prisma.cohort.create({
            data: {
              name: cohortData.name,
              startDate: new Date(cohortData.startDate),
              endDate: new Date(cohortData.endDate),
              organizationId,
              isActive: true,
            },
          });

          // Create invite links for the cohort
          const inviteLinks = [];

          // General cohort invite link
          const generalLink = await prisma.inviteLink.create({
            data: {
              token: crypto.randomBytes(32).toString('hex'),
              cohortId: cohort.id,
              expiresAt: cohort.startDate,
              maxUses: 1,
              isActive: true,
            },
          });
          inviteLinks.push(generalLink);

          // Per-department invite links
          if (Array.isArray(cohortData.departmentIds) && cohortData.departmentIds.length > 0) {
            for (const deptId of cohortData.departmentIds) {
              const deptLink = await prisma.inviteLink.create({
                data: {
                  token: crypto.randomBytes(32).toString('hex'),
                  cohortId: cohort.id,
                  departmentId: deptId,
                  expiresAt: cohort.startDate,
                  maxUses: 1,
                  isActive: true,
                },
              });
              inviteLinks.push(deptLink);
            }
          }

          created.push(cohort);
        } catch (err) {
          failed.push({
            index: i,
            name: cohortData.name,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    });

    // If any failed, return partial success with details
    if (failed.length > 0) {
      respond.error(
        res,
        `Failed to create ${failed.length} cohort(s): ${failed.map((f) => `${f.name} (${f.error})`).join(', ')}`,
        207, // Multi-status
      );
      return;
    }

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: req.user!.id,
        action: 'COHORTS_CREATED',
        tableName: 'Cohort',
        recordId: organizationId,
        reason: `Created ${created.length} cohorts`,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(
      res,
      {
        cohorts: created.map((c) => ({
          id: c.id,
          name: c.name,
          startDate: c.startDate,
          endDate: c.endDate,
        })),
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

// --- POST /api/setup/invite-links/revoke ---------------------------------------

export async function revokeInviteLink(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { linkId } = req.body as { linkId?: string };

    if (!linkId) {
      respond.error(res, 'linkId is required', 400);
      return;
    }

    const organizationId = req.user!.organizationId;

    // Verify the link belongs to the organization
    const link = await prisma.inviteLink.findFirst({
      where: { id: linkId },
      include: { cohort: true },
    });

    if (!link) {
      respond.error(res, 'Invite link not found', 404);
      return;
    }

    if (link.cohort.organizationId !== organizationId) {
      respond.error(res, 'You do not have permission to revoke this link', 403);
      return;
    }

    // Revoke the link
    await prisma.inviteLink.update({
      where: { id: linkId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: req.user!.id,
        action: 'INVITE_LINK_REVOKED',
        tableName: 'InviteLink',
        recordId: linkId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    respond.success(res, { message: 'Invite link revoked successfully' });
  } catch (err) {
    next(err);
  }
}

// --- GET /api/setup/invite-links ----------------------------------------------

export async function getInviteLinks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const organizationId = req.user!.organizationId;

    const inviteLinks = await prisma.inviteLink.findMany({
      where: {
        cohort: {
          organizationId,
        },
      },
      include: {
        cohort: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    interface InviteLinkRow {
      id: string;
      token: string;
      cohortId: string;
      cohort: { id: string; name: string };
      departmentId: string | null;
      department: { id: string; name: string } | null;
      isActive: boolean;
      revokedAt: Date | null;
      usedCount: number;
      maxUses: number;
      expiresAt: Date;
      createdAt: Date;
    }

    respond.success(res, {
      inviteLinks: inviteLinks.map((link: InviteLinkRow) => ({
        id: link.id,
        token: link.token,
        cohortId: link.cohortId,
        cohortName: link.cohort.name,
        departmentId: link.departmentId,
        departmentName: link.department?.name || null,
        isActive: link.isActive,
        revokedAt: link.revokedAt,
        usedCount: link.usedCount,
        maxUses: link.maxUses,
        expiresAt: link.expiresAt,
        createdAt: link.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}
