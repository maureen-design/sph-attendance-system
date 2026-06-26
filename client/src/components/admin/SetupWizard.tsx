'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Building2, Users, Calendar, Link as LinkIcon, Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { post } from '@/lib/api';
import { ApiError } from '@/lib/api';

type Step = 'organization' | 'departments' | 'cohorts' | 'invites';

interface SetupWizardProps {
  onComplete: () => void;
}

interface OrganizationData {
  name: string;
  timezone: string;
  logoUrl?: string;
}

interface DepartmentData {
  id: string;
  name: string;
  supervisorId?: string;
  shiftStart: string;
  shiftEnd: string;
  gracePeriod: number;
}

interface CohortData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  departmentIds: string[];
  inviteLinks?: Array<{ token: string; departmentId?: string }>;
}

const TIMEZONES = [
  'Africa/Nairobi',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'UTC',
];

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>('organization');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Organization
  const [orgData, setOrgData] = useState<OrganizationData>({
    name: '',
    timezone: 'Africa/Nairobi',
    logoUrl: '',
  });

  // Step 2: Departments
  const [departments, setDepartments] = useState<DepartmentData[]>([
    { id: '1', name: '', supervisorId: '', shiftStart: '09:00', shiftEnd: '17:00', gracePeriod: 15 },
  ]);

  // Step 3: Cohorts
  const [cohorts, setCohorts] = useState<CohortData[]>([
    { id: '1', name: '', startDate: '', endDate: '', departmentIds: [] },
  ]);

  const steps: { key: Step; label: string; icon: any }[] = [
    { key: 'organization', label: 'Organization', icon: Building2 },
    { key: 'departments', label: 'Departments', icon: Users },
    { key: 'cohorts', label: 'Cohorts', icon: Calendar },
    { key: 'invites', label: 'Invite Links', icon: LinkIcon },
  ];

  const stepIndex = steps.findIndex((s) => s.key === currentStep);

  const handleOrgSubmit = async () => {
    if (!orgData.name.trim()) {
      setError('Organization name is required');
      return;
    }
    if (!orgData.timezone) {
      setError('Timezone is required');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await post('/setup/organization', {
        name: orgData.name,
        timezone: orgData.timezone,
        logoUrl: orgData.logoUrl || undefined,
      });
      setCurrentStep('departments');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save organization';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDepartmentsSubmit = async () => {
    // Validate all departments
    const fieldErrors: string[] = [];
    departments.forEach((d, i) => {
      if (!d.name.trim()) fieldErrors.push(`Department ${i + 1}: name is required`);
      if (!d.shiftStart) fieldErrors.push(`Department ${i + 1}: shift start time is required`);
      if (!d.shiftEnd) fieldErrors.push(`Department ${i + 1}: shift end time is required`);
      if (d.gracePeriod < 0 || d.gracePeriod > 60) {
        fieldErrors.push(`Department ${i + 1}: grace period must be between 0 and 60 minutes`);
      }
    });

    if (fieldErrors.length > 0) {
      setError(fieldErrors.join('. '));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await post('/setup/departments', {
        departments: departments.map((d) => ({
          name: d.name,
          shiftStart: d.shiftStart,
          shiftEnd: d.shiftEnd,
          supervisorId: d.supervisorId || undefined,
        })),
      });
      setCurrentStep('cohorts');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save departments';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCohortsSubmit = async () => {
    // Validate all cohorts
    const fieldErrors: string[] = [];
    cohorts.forEach((c, i) => {
      if (!c.name.trim()) fieldErrors.push(`Cohort ${i + 1}: name is required`);
      if (!c.startDate) fieldErrors.push(`Cohort ${i + 1}: start date is required`);
      if (!c.endDate) fieldErrors.push(`Cohort ${i + 1}: end date is required`);

      // Validate date range
      if (c.startDate && c.endDate) {
        const start = new Date(c.startDate);
        const end = new Date(c.endDate);
        if (start >= end) {
          fieldErrors.push(`Cohort ${i + 1}: start date must be before end date`);
        }
      }
    });

    if (fieldErrors.length > 0) {
      setError(fieldErrors.join('. '));
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const response = await post('/setup/cohorts', {
        cohorts: cohorts.map((c) => ({
          name: c.name,
          startDate: c.startDate,
          endDate: c.endDate,
          departmentIds: c.departmentIds,
        })),
      });

      // Store invite links for each cohort
      const updatedCohorts = cohorts.map((c, i) => ({
        ...c,
        inviteLinks: response.cohorts[i]?.inviteLinks || [],
      }));
      setCohorts(updatedCohorts);

      setCurrentStep('invites');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save cohorts';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 'organization') {
      handleOrgSubmit();
    } else if (currentStep === 'departments') {
      handleDepartmentsSubmit();
    } else if (currentStep === 'cohorts') {
      handleCohortsSubmit();
    } else if (currentStep === 'invites') {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep === 'departments') {
      setCurrentStep('organization');
    } else if (currentStep === 'cohorts') {
      setCurrentStep('departments');
    } else if (currentStep === 'invites') {
      setCurrentStep('cohorts');
    }
  };

  return (
    <div className="rounded-2xl surface p-6 lg:p-8">
      {/* Progress indicator */}
      <div className="mb-8 flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = step.key === currentStep;
          const isCompleted = index < stepIndex;

          return (
            <div key={step.key} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
                  isActive
                    ? 'bg-sph-green text-white'
                    : isCompleted
                      ? 'bg-sph-green/20 text-sph-green'
                      : 'bg-[var(--surface-elevated)] text-muted'
                }`}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <span
                className={`text-xs font-medium transition-colors duration-150 ${
                  isActive ? 'text-[var(--text-primary)]' : isCompleted ? 'text-sph-green' : 'text-muted'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[300px]">
        {currentStep === 'organization' && (
          <Step1Organization
            data={orgData}
            onChange={setOrgData}
            error={error}
            isSubmitting={isSubmitting}
          />
        )}
        {currentStep === 'departments' && (
          <Step2Departments
            departments={departments}
            onChange={setDepartments}
          />
        )}
        {currentStep === 'cohorts' && (
          <Step3Cohorts
            cohorts={cohorts}
            departments={departments}
            onChange={setCohorts}
          />
        )}
        {currentStep === 'invites' && (
          <Step4Invites
            cohorts={cohorts}
            departments={departments}
            onBack={handleBack}
            onFinish={onComplete}
          />
        )}
      </div>

      {/* Navigation buttons - hide on Step 4 since it has its own */}
      {currentStep !== 'invites' && (
        <div className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 'organization' || isSubmitting}
            className="h-11 rounded-xl border-[var(--border)]"
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isSubmitting}
            className="h-11 rounded-xl"
          >
            {isSubmitting ? (
              'Saving...'
            ) : (
              <>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Step 1: Organization
function Step1Organization({
  data,
  onChange,
  error,
  isSubmitting,
}: {
  data: OrganizationData;
  onChange: (data: OrganizationData) => void;
  error: string;
  isSubmitting: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Organization Details</h2>
        <p className="mt-1 text-sm text-secondary">
          Enter your organization information to get started.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orgName">Organization Name *</Label>
          <Input
            id="orgName"
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            placeholder="e.g., Swahilipot Hub"
            className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone *</Label>
          <select
            id="timezone"
            value={data.timezone}
            onChange={(e) => onChange({ ...data, timezone: e.target.value })}
            className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
            disabled={isSubmitting}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logoUrl">Logo URL (optional)</Label>
          <Input
            id="logoUrl"
            value={data.logoUrl}
            onChange={(e) => onChange({ ...data, logoUrl: e.target.value })}
            placeholder="https://example.com/logo.png"
            className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
            disabled={isSubmitting}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
          {error}
        </div>
      )}
    </div>
  );
}

// Step 2: Departments
function Step2Departments({
  departments,
  onChange,
}: {
  departments: DepartmentData[];
  onChange: (departments: DepartmentData[]) => void;
}) {
  const addDepartment = () => {
    const newId = (departments.length + 1).toString();
    onChange([
      ...departments,
      { id: newId, name: '', supervisorId: '', shiftStart: '09:00', shiftEnd: '17:00', gracePeriod: 15 },
    ]);
  };

  const removeDepartment = (id: string) => {
    if (departments.length === 1) return;
    onChange(departments.filter((d) => d.id !== id));
  };

  const updateDepartment = (id: string, field: keyof DepartmentData, value: string | number) => {
    onChange(departments.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Departments</h2>
        <p className="mt-1 text-sm text-secondary">
          Add departments and configure their shift schedules.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {departments.map((dept, index) => (
          <div
            key={dept.id}
            className="rounded-xl border border-[var(--border)] surface-elevated p-4 transition-all duration-150"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Department {index + 1}
              </span>
              {departments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeDepartment(dept.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sph-red transition-colors hover:bg-sph-red/10"
                  aria-label="Remove department"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`dept-name-${dept.id}`}>Department Name *</Label>
                <Input
                  id={`dept-name-${dept.id}`}
                  value={dept.name}
                  onChange={(e) => updateDepartment(dept.id, 'name', e.target.value)}
                  placeholder="e.g., Engineering"
                  className="h-11 rounded-xl border-[var(--border)] px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dept-supervisor-${dept.id}`}>Supervisor (optional)</Label>
                <select
                  id={`dept-supervisor-${dept.id}`}
                  value={dept.supervisorId}
                  onChange={(e) => updateDepartment(dept.id, 'supervisorId', e.target.value)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                >
                  <option value="">No supervisor assigned</option>
                  {/* TODO: Fetch and populate users from backend */}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dept-grace-${dept.id}`}>Grace Period (minutes)</Label>
                <Input
                  id={`dept-grace-${dept.id}`}
                  type="number"
                  min="0"
                  max="60"
                  value={dept.gracePeriod}
                  onChange={(e) => updateDepartment(dept.id, 'gracePeriod', parseInt(e.target.value) || 0)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dept-start-${dept.id}`}>Shift Start *</Label>
                <Input
                  id={`dept-start-${dept.id}`}
                  type="time"
                  value={dept.shiftStart}
                  onChange={(e) => updateDepartment(dept.id, 'shiftStart', e.target.value)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`dept-end-${dept.id}`}>Shift End *</Label>
                <Input
                  id={`dept-end-${dept.id}`}
                  type="time"
                  value={dept.shiftEnd}
                  onChange={(e) => updateDepartment(dept.id, 'shiftEnd', e.target.value)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                />
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addDepartment}
          className="h-11 w-full rounded-xl border-dashed border-[var(--border)] text-sph-green hover:bg-sph-green/5"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Another Department
        </Button>
      </div>
    </div>
  );
}

// Step 3: Cohorts
function Step3Cohorts({
  cohorts,
  departments,
  onChange,
}: {
  cohorts: CohortData[];
  departments: DepartmentData[];
  onChange: (cohorts: CohortData[]) => void;
}) {
  const addCohort = () => {
    const newId = (cohorts.length + 1).toString();
    onChange([
      ...cohorts,
      { id: newId, name: '', startDate: '', endDate: '', departmentIds: [] },
    ]);
  };

  const removeCohort = (id: string) => {
    if (cohorts.length === 1) return;
    onChange(cohorts.filter((c) => c.id !== id));
  };

  const updateCohort = (id: string, field: keyof CohortData, value: string | string[]) => {
    onChange(cohorts.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const toggleDepartment = (cohortId: string, deptId: string) => {
    const cohort = cohorts.find((c) => c.id === cohortId);
    if (!cohort) return;

    const newDeptIds = cohort.departmentIds.includes(deptId)
      ? cohort.departmentIds.filter((id) => id !== deptId)
      : [...cohort.departmentIds, deptId];

    updateCohort(cohortId, 'departmentIds', newDeptIds);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Cohorts</h2>
        <p className="mt-1 text-sm text-secondary">
          Create cohorts and assign departments.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {cohorts.map((cohort, index) => (
          <div
            key={cohort.id}
            className="rounded-xl border border-[var(--border)] surface-elevated p-4 transition-all duration-150"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Cohort {index + 1}
              </span>
              {cohorts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCohort(cohort.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sph-red transition-colors hover:bg-sph-red/10"
                  aria-label="Remove cohort"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`cohort-name-${cohort.id}`}>Cohort Name *</Label>
                <Input
                  id={`cohort-name-${cohort.id}`}
                  value={cohort.name}
                  onChange={(e) => updateCohort(cohort.id, 'name', e.target.value)}
                  placeholder="e.g., 2024 Q1 Cohort"
                  className="h-11 rounded-xl border-[var(--border)] px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cohort-start-${cohort.id}`}>Start Date *</Label>
                <Input
                  id={`cohort-start-${cohort.id}`}
                  type="date"
                  value={cohort.startDate}
                  onChange={(e) => updateCohort(cohort.id, 'startDate', e.target.value)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`cohort-end-${cohort.id}`}>End Date *</Label>
                <Input
                  id={`cohort-end-${cohort.id}`}
                  type="date"
                  value={cohort.endDate}
                  onChange={(e) => updateCohort(cohort.id, 'endDate', e.target.value)}
                  className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label>Departments</Label>
                {departments.length === 0 ? (
                  <p className="text-sm text-secondary">No departments available. Add departments in Step 2.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {departments.map((dept) => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => toggleDepartment(cohort.id, dept.id)}
                        className={`h-9 rounded-lg px-3 text-sm font-medium transition-all duration-150 ${
                          cohort.departmentIds.includes(dept.id)
                            ? 'bg-sph-green text-white'
                            : 'surface-elevated border border-[var(--border)] text-secondary hover:border-sph-green/50'
                        }`}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={addCohort}
          className="h-11 w-full rounded-xl border-dashed border-[var(--border)] text-sph-green hover:bg-sph-green/5"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Another Cohort
        </Button>
      </div>
    </div>
  );
}

// Step 4: Invite Links
function Step4Invites({
  cohorts,
  departments,
  onBack,
  onFinish,
}: {
  cohorts: CohortData[];
  departments: DepartmentData[];
  onBack: () => void;
  onFinish: () => void;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);

  const copyToClipboard = async (token: string) => {
    const inviteUrl = `${window.location.origin}/register?token=${token}`;
    await navigator.clipboard.writeText(inviteUrl);
  };

  const handleRevoke = async (linkId: string) => {
    setRevoking(linkId);
    try {
      await post('/setup/invite-links/revoke', { linkId });
    } catch (err) {
      console.error('Failed to revoke link:', err);
    } finally {
      setRevoking(null);
    }
  };

  const getDepartmentName = (deptId?: string) => {
    if (!deptId) return 'All Departments';
    const dept = departments.find((d) => d.id === deptId);
    return dept?.name || 'Unknown Department';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invite Links</h2>
        <p className="mt-1 text-sm text-secondary">
          Share these links with new members to register. Each link can only be used once.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {cohorts.map((cohort) => (
          <div
            key={cohort.id}
            className="rounded-xl border border-[var(--border)] surface-elevated p-4 transition-all duration-150"
          >
            <h3 className="mb-3 text-sm font-medium text-[var(--text-primary)]">{cohort.name}</h3>

            <div className="flex flex-col gap-2">
              {cohort.inviteLinks?.map((link, linkIndex) => (
                <div
                  key={`${cohort.id}-${linkIndex}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {getDepartmentName(link.departmentId)}
                    </p>
                    <p className="truncate text-xs text-secondary">
                      {window.location.origin}/register?token={link.token}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(link.token)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-sph-green transition-colors hover:bg-sph-green/10"
                    aria-label="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRevoke(link.token)}
                    disabled={revoking === link.token}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-sph-red transition-colors hover:bg-sph-red/10 disabled:opacity-50"
                    aria-label="Revoke link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {(!cohort.inviteLinks || cohort.inviteLinks.length === 0) && (
                <p className="text-sm text-secondary">No invite links generated for this cohort.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-11 rounded-xl border-[var(--border)] px-6"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Button
          type="button"
          onClick={onFinish}
          className="h-11 rounded-xl bg-sph-green px-6 text-white hover:bg-sph-green/90"
        >
          Finish Setup
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
