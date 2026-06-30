'use client';

import { useState, useCallback } from 'react';
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

function orbColor(status: string | null): 'green' | 'amber' | 'red' {
  if (!status) return 'green';
  if (status === 'ON_TIME' || status === 'EARLY') return 'green';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'amber';
  if (status === 'UNRESOLVED') return 'red';
  return 'green';
}

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-surface-elevated text-secondary';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'bg-sph-amber/20 text-sph-amber';
  if (status === 'UNRESOLVED') return 'bg-sph-red/20 text-sph-red';
  return 'bg-sph-green/20 text-sph-green';
}

const GRADIENTS = {
  green: 'radial-gradient(circle at 35% 30%, #34D399, #059669)',
  amber: 'radial-gradient(circle at 35% 30%, #FBBF24, #D97706)',
  red: 'radial-gradient(circle at 35% 30%, #F87171, #DC2626)',
} as const;

const GLOW_COLORS = {
  green: 'rgba(16,185,129,0.35)',
  amber: 'rgba(245,158,11,0.35)',
  red: 'rgba(239,68,68,0.35)',
} as const;

const GLOW_HOVER = {
  green: 'rgba(16,185,129,0.5)',
  amber: 'rgba(245,158,11,0.5)',
  red: 'rgba(239,68,68,0.5)',
} as const;

const ORB_SIZE = 'clamp(120px, 25vw, 160px)';
const ORB_RADIUS = '48% 52% 50% 50% / 50% 50% 48% 52%';

function OrbButton({
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
  const [isPressed, setIsPressed] = useState(false);

  const handlePointerDown = useCallback(() => setIsPressed(true), []);
  const handlePointerUp = useCallback(() => setIsPressed(false), []);
  const handlePointerLeave = useCallback(() => setIsPressed(false), []);

  const orbStyle: React.CSSProperties = {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_RADIUS,
    background: GRADIENTS[color],
    '--glow-color': GLOW_COLORS[color],
    '--glow-hover-color': GLOW_HOVER[color],
    border: 'none',
    outline: 'none',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: isLoading ? 'wait' : 'pointer',
    animation: 'breath-orb 3s ease-in-out infinite',
    transition: 'filter 200ms ease',
    filter: 'brightness(1)',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      disabled={isLoading}
      style={orbStyle}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.animationPlayState = 'paused';
        el.style.setProperty('--glow-color', GLOW_HOVER[color]);
        el.style.filter = 'brightness(1.1)';
        el.style.boxShadow = `0 0 40px ${GLOW_HOVER[color]}`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.animationPlayState = 'running';
        el.style.setProperty('--glow-color', GLOW_COLORS[color]);
        el.style.filter = 'brightness(1)';
        el.style.boxShadow = '';
      }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          borderRadius: ORB_RADIUS,
          background: GRADIENTS[color],
          transform: isPressed ? 'scale(1.06, 0.92)' : 'scale(1)',
          transition: isPressed
            ? 'transform 100ms ease'
            : 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: isPressed ? `0 0 40px ${GLOW_COLORS[color]}` : 'none',
        }}
      >
        {isLoading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <span
            className="select-none"
            style={{
              color: '#fff',
              fontWeight: 600,
              fontSize: 'clamp(0.75rem, 2vw, 0.875rem)',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        )}
      </div>
    </button>
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
        <OrbButton
          color={orbColor(status)}
          onClick={doCheckOut}
          isLoading={isSubmitting}
          label="Check Out"
        />
        <div className="flex flex-col items-center gap-2 rounded-2xl surface p-4">
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${statusBadgeClass(status)}`}
          >
            {status}
          </span>
          <p className="text-sm text-secondary">Checked in at {formatTime(checkInTime)}</p>
        </div>
        {error && <p className="text-xs text-sph-red">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <OrbButton color="green" onClick={doCheckIn} isLoading={isSubmitting} label="Check In" />
      {error && <p className="text-xs text-sph-red">{error}</p>}
    </div>
  );
}
