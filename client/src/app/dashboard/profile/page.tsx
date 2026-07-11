'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  User,
  Mail,
  Shield,
  Building2,
  Calendar,
  BookOpen,
  Phone,
  Lock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get, patch, post } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  institution: string | null;
  role: string;
  departmentId: string | null;
  cohortId: string | null;
  status: string;
  createdAt: string;
  department: { name: string } | null;
  cohort: { name: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  DEPARTMENT_SUPERVISOR: 'Supervisor',
  STAFF: 'Staff',
  MEMBER: 'Member',
  ATTACHEE: 'Attachee',
};

export default function ProfilePage() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Phone editing
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<ProfileData>('/users/profile');
      setProfile(data);
      setPhoneInput(data.phone ?? '');
    } catch {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  const handleSavePhone = async () => {
    setSavingPhone(true);
    setPhoneError('');
    setPhoneSaved(false);
    try {
      const data = await patch<{ user: ProfileData }>('/users/profile/phone', {
        phone: phoneInput,
      });
      setProfile(data.user);
      setPhoneSaved(true);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Failed to update phone');
    } finally {
      setSavingPhone(false);
    }
  };

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      setChangingPassword(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      setChangingPassword(false);
      return;
    }

    try {
      await post('/auth/change-password', { currentPassword, newPassword });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <XCircle className="mx-auto mb-4 h-12 w-12 text-sph-red" />
        <p className="text-[var(--text-secondary)]">{error ?? 'Profile not found'}</p>
      </div>
    );
  }

  const isAttachee = profile.role === 'ATTACHEE';

  return (
    <div className="mx-auto max-w-lg space-y-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Profile</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Manage your account information</p>
      </div>

      {/* ── Read-only info ── */}
      <section className="rounded-2xl border border-[var(--border)] surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">
          Account Details
        </h2>
        <div className="space-y-4">
          <InfoRow icon={User} label="Full Name" value={profile.fullName} />
          <InfoRow icon={Mail} label="Email" value={profile.email} />
          <InfoRow icon={Shield} label="Role" value={ROLE_LABELS[profile.role] ?? profile.role} />
          <InfoRow
            icon={Building2}
            label="Department"
            value={profile.department?.name ?? 'Not specified'}
          />
          {isAttachee && (
            <>
              <InfoRow
                icon={Calendar}
                label="Cohort"
                value={profile.cohort?.name ?? 'Not specified'}
              />
              <InfoRow
                icon={BookOpen}
                label="Institution"
                value={profile.institution ?? 'Not specified'}
              />
            </>
          )}
        </div>
      </section>

      {/* ── Contact ── */}
      <section className="rounded-2xl border border-[var(--border)] surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Contact</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="phone" className="mb-1.5 block text-sm text-[var(--text-secondary)]">
              Phone
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+254 700 000 000"
              className="h-11 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors hover:border-[var(--text-muted)]"
            />
          </div>
          <button
            type="button"
            disabled={savingPhone || phoneInput === (profile.phone ?? '')}
            onClick={handleSavePhone}
            className="flex h-11 items-center gap-2 rounded-xl bg-sph-green px-5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {savingPhone ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Save'
            )}
          </button>
        </div>
        {phoneSaved && (
          <p className="mt-2 flex items-center gap-1 text-sm text-sph-green">
            <CheckCircle className="h-4 w-4" />
            Phone updated successfully
          </p>
        )}
        {phoneError && <p className="mt-2 text-sm text-sph-red">{phoneError}</p>}
      </section>

      {/* ── Security ── */}
      <section className="rounded-2xl border border-[var(--border)] surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">Security</h2>

        {passwordSuccess && (
          <div className="mb-4 rounded-xl border border-sph-green/30 bg-sph-green/10 px-4 py-3 text-sm text-sph-green">
            Password changed successfully
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <fieldset disabled={changingPassword} className="space-y-4">
            {/* Current Password */}
            <div>
              <Label
                htmlFor="currentPassword"
                className="mb-1.5 block text-sm text-[var(--text-secondary)]"
              >
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <ToggleVis show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />
              </div>
            </div>

            {/* New Password */}
            <div>
              <Label
                htmlFor="newPassword"
                className="mb-1.5 block text-sm text-[var(--text-secondary)]"
              >
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <ToggleVis show={showNew} onToggle={() => setShowNew(!showNew)} />
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <Label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm text-[var(--text-secondary)]"
              >
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={passwordMismatch}
                  className="h-11 w-full rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 pr-12 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
                <ToggleVis show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
              </div>
              {passwordMismatch && (
                <span className="mt-1 text-sm text-sph-red">Passwords do not match</span>
              )}
            </div>
          </fieldset>

          {passwordError && (
            <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
              {passwordError}
            </div>
          )}

          <button
            type="submit"
            disabled={
              changingPassword ||
              passwordMismatch ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
            className="flex w-full items-center justify-center rounded-xl bg-sph-green py-3 font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {changingPassword ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Changing...
              </>
            ) : (
              'Change Password'
            )}
          </button>
        </form>
      </section>
    </div>
  );
}

// ── Shared sub-components ──

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-elevated)]">
        <Icon className="h-4 w-4 text-[var(--text-secondary)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}

function ToggleVis({ show, onToggle }: { show: boolean; onToggle: () => void }) {
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
