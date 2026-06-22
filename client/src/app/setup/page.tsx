'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, CheckCircle, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { get, post, ApiError, setTokens } from '@/lib/api';

// ── Types ──

interface Department {
  name: string;
  shiftStart: string;
  shiftEnd: string;
}

interface SetupStatus {
  setupRequired: boolean;
}

interface SetupResponse {
  organization: { id: string };
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// ── Default departments ──

const DEFAULT_DEPARTMENTS: Department[] = [
  { name: 'Tech', shiftStart: '08:00', shiftEnd: '17:00' },
  { name: 'Communication', shiftStart: '08:30', shiftEnd: '17:00' },
  { name: 'Creatives', shiftStart: '09:00', shiftEnd: '17:00' },
  { name: 'Youth Engagement', shiftStart: '08:30', shiftEnd: '16:30' },
  { name: 'Administration', shiftStart: '08:00', shiftEnd: '17:00' },
];

// ── Step indicator ──

function StepIndicator({ current }: { current: number }) {
  const steps = ['Organization', 'Admin', 'Departments', 'Complete'];
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < current
                  ? 'bg-sph-green/20 text-sph-green'
                  : i === current
                    ? 'bg-sph-green text-white'
                    : 'surface-elevated text-muted'
              }`}
            >
              {i < current ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className="hidden text-[10px] text-muted sm:block">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-6 transition-colors ${
                i < current ? 'bg-sph-green/40' : 'bg-[var(--border)]'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Eye toggle (reusable) ──

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      aria-label={show ? 'Hide password' : 'Show password'}
    >
      {show ? (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
          />
        </svg>
      ) : (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

// ── Main page ──

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep] = useState(0); // 0-based: 0,1,2,3
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Organization
  const [orgName, setOrgName] = useState('');
  const [shortName, setShortName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [timezone, setTimezone] = useState('');

  // Step 2: Admin
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Step 3: Departments
  const [departments, setDepartments] = useState<Department[]>(DEFAULT_DEPARTMENTS);

  // Check setup status on mount
  useEffect(() => {
    let cancelled = false;
    get<SetupStatus>('/setup/status')
      .then((res) => {
        if (!cancelled && !res.setupRequired) {
          router.replace('/login');
        }
      })
      .catch(() => {
        // If check fails, stay on page
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── Department helpers ──

  const updateDept = (index: number, field: keyof Department, value: string) => {
    setDepartments((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  const removeDept = (index: number) => {
    setDepartments((prev) => prev.filter((_, i) => i !== index));
  };

  const addDept = () => {
    setDepartments((prev) => [...prev, { name: '', shiftStart: '08:00', shiftEnd: '17:00' }]);
  };

  // ── Navigation ──

  const goNext = () => {
    setError('');
    if (step === 1 && adminPassword !== adminConfirm) {
      setError('Passwords do not match');
      return;
    }
    if (step < 3) setStep(step + 1);
  };

  const goBack = () => {
    setError('');
    if (step > 0) setStep(step - 1);
  };

  // ── Final submit ──

  const handleSubmit = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      // 1) Create organization + admin
      const setupRes = await post<SetupResponse>('/setup', {
        organizationName: orgName,
        organizationShortName: shortName,
        contactEmail,
        timezone: timezone || 'Africa/Nairobi',
        adminFullName: adminName,
        adminEmail,
        adminPassword,
      });

      // 2) Login to get tokens
      const loginRes = await post<LoginResponse>('/auth/login', {
        email: adminEmail,
        password: adminPassword,
        organizationId: setupRes.organization.id,
      });
      setTokens(loginRes.accessToken, loginRes.refreshToken);

      // 3) Post departments
      if (departments.length > 0) {
        await post('/setup/departments', {
          departments: departments.map((d) => ({
            name: d.name,
            shiftStart: d.shiftStart,
            shiftEnd: d.shiftEnd,
          })),
        });
      }

      // 4) Show success
      setStep(3);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Setup failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 4: Complete ──
  if (step === 3) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sph-dark px-6">
        <div className="flex flex-col items-center text-center">
          <CheckCircle className="mb-6 h-16 w-16 text-sph-green" />
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{orgName} is ready!</h2>
          <p className="mt-2 text-sm text-secondary">
            Your system is configured. Log in to get started.
          </p>
          <Link
            href="/login"
            className="mt-8 rounded-xl bg-sph-green px-8 py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  // ── Steps 1-3: Form ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-sph-dark px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-sph-green/30 bg-sph-green/10">
            <span className="text-lg font-bold text-sph-green">SPH</span>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">System Setup</h1>
          <p className="mt-1 text-sm text-secondary">
            This runs once to configure your organization
          </p>
        </div>

        <StepIndicator current={step} />

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent>
            {/* ── STEP 1 ── */}
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Organization Details
                </h2>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Swahilipot Hub"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="shortName">Short Name</Label>
                  <Input
                    id="shortName"
                    required
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="SPH"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                  <span className="text-xs text-muted">Used as identifier, no spaces</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="admin@organization.org"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="Africa/Nairobi"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>
              </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Super Admin Account
                </h2>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminName">Full Name</Label>
                  <Input
                    id="adminName"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Jane Doe"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminEmail">Email Address</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@sph.org"
                    className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="adminPassword"
                      type={showPw ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                    <EyeToggle show={showPw} onToggle={() => setShowPw(!showPw)} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminConfirm">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="adminConfirm"
                      type={showConfirmPw ? 'text' : 'password'}
                      required
                      value={adminConfirm}
                      onChange={(e) => setAdminConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                    <EyeToggle
                      show={showConfirmPw}
                      onToggle={() => setShowConfirmPw(!showConfirmPw)}
                    />
                  </div>
                  {adminConfirm.length > 0 && adminPassword !== adminConfirm && (
                    <span className="text-sm text-sph-red">Passwords do not match</span>
                  )}
                </div>

                <div className="rounded-xl border border-sph-amber/30 bg-sph-amber/10 px-4 py-3 text-sm text-sph-amber">
                  This will be the master admin account. Store these credentials safely.
                </div>
              </div>
            )}

            {/* ── STEP 3 ── */}
            {step === 2 && (
              <div className="flex flex-col gap-5">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Departments</h2>

                <div className="flex flex-col gap-3">
                  {departments.map((dept, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1">
                        {i === 0 && <Label className="mb-1 text-xs text-muted">Name</Label>}
                        <Input
                          value={dept.name}
                          onChange={(e) => updateDept(i, 'name', e.target.value)}
                          placeholder="Department name"
                          className="h-10 rounded-xl border-[var(--border)] surface-elevated px-3 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                        />
                      </div>
                      <div className="w-24">
                        {i === 0 && <Label className="mb-1 text-xs text-muted">Start</Label>}
                        <Input
                          type="time"
                          value={dept.shiftStart}
                          onChange={(e) => updateDept(i, 'shiftStart', e.target.value)}
                          className="h-10 rounded-xl border-[var(--border)] surface-elevated px-2 text-[var(--text-primary)]"
                        />
                      </div>
                      <div className="w-24">
                        {i === 0 && <Label className="mb-1 text-xs text-muted">End</Label>}
                        <Input
                          type="time"
                          value={dept.shiftEnd}
                          onChange={(e) => updateDept(i, 'shiftEnd', e.target.value)}
                          className="h-10 rounded-xl border-[var(--border)] surface-elevated px-2 text-[var(--text-primary)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDept(i)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sph-red transition-colors hover:bg-sph-red/10"
                        aria-label={`Remove ${dept.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addDept}
                  className="rounded-xl border border-dashed border-sph-green/30 py-2.5 text-sm text-sph-green transition-colors hover:bg-sph-green/10"
                >
                  + Add Department
                </button>
              </div>
            )}

            {/* ── Error ── */}
            {error && (
              <div className="mt-5 rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
                {error}
              </div>
            )}

            {/* ── Navigation buttons ── */}
            <div className="mt-6 flex items-center justify-between">
              {step > 0 ? (
                <Button
                  variant="outline"
                  onClick={goBack}
                  disabled={isSubmitting}
                  className="h-11 rounded-xl px-6"
                >
                  ← Back
                </Button>
              ) : (
                <div />
              )}

              {step < 2 ? (
                <Button onClick={goNext} className="h-11 rounded-xl px-6">
                  Next →
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="h-11 rounded-xl px-6"
                >
                  {isSubmitting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Setting up...
                    </>
                  ) : (
                    'Set Up System →'
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
