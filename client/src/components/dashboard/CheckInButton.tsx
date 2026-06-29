'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { post, ApiError } from '@/lib/api';

// ── Types ──

export type CheckInPhase = 'idle' | 'checked-in' | 'checked-out';

interface CheckInButtonProps {
  phase: CheckInPhase;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  onCheckedIn: (log: { id: string; status: string; checkInTime: string }) => void;
  onCheckedOut: (log: { id: string; status: string; checkOutTime: string }) => void;
  role: string;
  departmentName?: string;
}

interface CheckInResponse {
  attendanceLog: {
    id: string;
    status: string;
    checkInTime: string;
    date: string;
  };
}

interface CheckOutResponse {
  attendanceLog: {
    id: string;
    status: string;
    checkInTime: string;
    checkOutTime: string;
  };
}

// ── Helpers ──

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '--:--';
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-surface-elevated text-secondary';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'bg-sph-amber/20 text-sph-amber';
  if (status === 'UNRESOLVED') return 'bg-sph-red/20 text-sph-red';
  return 'bg-sph-green/20 text-sph-green';
}

function ringBorderColor(status: string | null): string {
  if (!status) return 'border-sph-green';
  if (status === 'ON_TIME' || status === 'EARLY') return 'border-sph-green';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'border-sph-amber';
  if (status === 'UNRESOLVED') return 'border-sph-red';
  return 'border-sph-green';
}

// ── One-tap circular button ──

function CircularButton({
  label,
  borderColor,
  onClick,
  isLoading,
}: {
  label: string;
  borderColor: string;
  onClick: () => void;
  isLoading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full border-[3px] bg-transparent font-semibold tracking-wider transition-all duration-150 active:scale-[0.98] disabled:opacity-50 md:h-[140px] md:w-[140px] ${borderColor} ${
        isLoading ? 'cursor-wait' : 'cursor-pointer hover:bg-sph-green/10'
      }`}
    >
      {isLoading ? (
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sph-green border-t-transparent" />
      ) : (
        <span className="text-sm text-sph-green md:text-base">{label}</span>
      )}
    </button>
  );
}

// ── Component ──

export function CheckInButton({
  phase,
  status,
  checkInTime,
  checkOutTime,
  onCheckedIn,
  onCheckedOut,
  role,
  departmentName,
}: CheckInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── SUPER ADMIN: show admin card instead of check-in ──
  if (role === 'SUPER_ADMIN') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Shield className="h-12 w-12 text-sph-blue" />
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">System Administrator</h3>
          <p className="mt-1 text-sm text-secondary">
            You have full access to manage SPH Attendance.
          </p>
        </div>
        <a
          href="/dashboard/admin"
          className="rounded-xl bg-sph-blue px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-blue/25"
        >
          Go to Admin Dashboard →
        </a>
      </div>
    );
  }

  const doCheckIn = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const res = await post<CheckInResponse>('/attendance/check-in', {});
      onCheckedIn(res.attendanceLog);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Check-in failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const doCheckOut = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const res = await post<CheckOutResponse>('/attendance/check-out', {});
      onCheckedOut(res.attendanceLog);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Check-out failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── CHECKED OUT ──
  if (phase === 'checked-out') {
    return null;
  }

  // ── CHECKED IN ──
  if (phase === 'checked-in') {
    return (
      <div className="flex flex-col items-center gap-4">
        {departmentName && <p className="text-sm text-secondary">{departmentName}</p>}
        <div className={`rounded-full px-5 py-2 text-sm font-semibold ${statusBadgeClass(status)}`}>
          {status}
        </div>
        <p className="text-sm text-secondary">Checked in at {formatTime(checkInTime)}</p>
        <CircularButton
          label="CHECK OUT"
          borderColor={ringBorderColor(status)}
          onClick={doCheckOut}
          isLoading={isSubmitting}
        />
        {error && <p className="text-xs text-sph-red">{error}</p>}
      </div>
    );
  }

  // ── IDLE (not checked in) ──
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-secondary">You haven&apos;t checked in yet</p>
      <CircularButton
        label="CHECK IN"
        borderColor="border-sph-green"
        onClick={doCheckIn}
        isLoading={isSubmitting}
      />
      {error && <p className="text-xs text-sph-red">{error}</p>}
    </div>
  );
}
