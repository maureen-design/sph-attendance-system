'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { post, ApiError } from '@/lib/api';

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

function buttonColor(status: string | null): 'green' | 'amber' | 'red' {
  if (!status) return 'green';
  if (status === 'ON_TIME' || status === 'EARLY') return 'green';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'amber';
  if (status === 'UNRESOLVED') return 'red';
  return 'green';
}

function CircularButton({
  color,
  onClick,
  isLoading,
  label,
}: {
  color: 'green' | 'amber' | 'red';
  onClick: () => void;
  isLoading: boolean;
  label: string;
}) {
  const bgColor =
    color === 'green' ? 'bg-sph-green' : color === 'amber' ? 'bg-sph-amber' : 'bg-sph-red';

  const glowClass =
    color === 'green'
      ? 'animate-[pulse-glow-green_2s_ease-in-out_infinite]'
      : color === 'amber'
        ? 'animate-[pulse-glow-amber_2s_ease-in-out_infinite]'
        : 'animate-[pulse-glow-red_2s_ease-in-out_infinite]';

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={isLoading}
        className={
          'flex h-[100px] w-[100px] items-center justify-center rounded-full sm:h-[120px] sm:w-[120px] lg:h-[140px] lg:w-[140px] ' +
          bgColor +
          ' transition-all duration-150 active:scale-[0.98] disabled:opacity-50 ' +
          (isLoading
            ? 'cursor-wait'
            : 'cursor-pointer hover:brightness-110 hover:shadow-2xl hover:animate-none ' +
              glowClass)
        }
      >
        {isLoading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : null}
      </button>
      <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
    </div>
  );
}

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

  if (phase === 'checked-out') {
    return null;
  }

  if (phase === 'checked-in') {
    return (
      <div className="flex flex-col items-center gap-4">
        {departmentName && <p className="text-sm text-secondary">{departmentName}</p>}
        <CircularButton
          color={buttonColor(status)}
          onClick={doCheckOut}
          isLoading={isSubmitting}
          label="Check Out"
        />
        <div className="flex flex-col items-center gap-2 rounded-2xl p-4 surface">
          <div
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${statusBadgeClass(status)}`}
          >
            {status}
          </div>
          <p className="text-sm text-secondary">Checked in at {formatTime(checkInTime)}</p>
        </div>
        {error && <p className="text-xs text-sph-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <CircularButton color="green" onClick={doCheckIn} isLoading={isSubmitting} label="Check In" />
      {error && <p className="text-xs text-sph-red">{error}</p>}
    </div>
  );
}
