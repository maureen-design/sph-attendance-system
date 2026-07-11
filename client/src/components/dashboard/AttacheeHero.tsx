'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, Check, Loader2, AlertTriangle } from 'lucide-react';
import { post, get, ApiError } from '@/lib/api';

// ── Types ──

export type HeroPhase = 'idle' | 'checked-in' | 'checked-out';

interface HeroProps {
  phase: HeroPhase;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  onCheckedIn: (log: { id: string; status: string; checkInTime: string }) => void;
  onCheckedOut: (log: { id: string; status: string; checkOutTime: string }) => void;
  role: string;
}

interface ForgottenSession {
  id: string;
  date: string;
  checkInTime: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function statusLabel(s: string | null): string {
  switch (s) {
    case 'EARLY':
      return 'Early';
    case 'ON_TIME':
      return 'On-Time';
    case 'LATE':
      return 'Late';
    case 'LEFT_EARLY':
      return 'Left Early';
    default:
      return s ?? '--';
  }
}

function statusBadgeClass(s: string | null): string {
  switch (s) {
    case 'EARLY':
    case 'ON_TIME':
      return 'bg-sph-green/10 text-sph-green border-sph-green/20';
    case 'LATE':
      return 'bg-sph-amber/10 text-sph-amber border-sph-amber/20';
    case 'LEFT_EARLY':
      return 'bg-sph-amber/10 text-sph-amber border-sph-amber/20';
    default:
      return 'bg-[var(--surface-elevated)] text-muted border-[var(--border)]';
  }
}

// ── Component ──

export function AttacheeHero({
  phase,
  status,
  checkInTime,
  checkOutTime,
  onCheckedIn,
  onCheckedOut,
  role,
}: HeroProps) {
  const [local, setLocal] = useState<
    'idle' | 'processing' | 'success' | 'checked-in' | 'checked-out'
  >(phase === 'checked-in' ? 'checked-in' : phase === 'checked-out' ? 'checked-out' : 'idle');
  const [error, setError] = useState('');
  const [forgotten, setForgotten] = useState<ForgottenSession | null>(null);
  const [forgottenTime, setForgottenTime] = useState('');
  const [submittingForgotten, setSubmittingForgotten] = useState(false);
  const [shiftEnd, setShiftEnd] = useState<string | null>(null);

  // Sync parent phase → local state (except during transient states)
  useEffect(() => {
    if (phase === 'checked-in' && local === 'idle') setLocal('checked-in');
    if (phase === 'checked-out' && (local === 'idle' || local === 'checked-in'))
      setLocal('checked-out');
  }, [phase, local]);

  // Check for forgotten checkout on mount
  useEffect(() => {
    if (phase !== 'idle') return;
    const check = async () => {
      try {
        const data = await get<{ forgotten: ForgottenSession | null; shiftEnd: string | null }>(
          '/attendance/forgotten-checkout',
        );
        if (data.forgotten) {
          setForgotten(data.forgotten);
          setShiftEnd(data.shiftEnd);
          const ci = new Date(data.forgotten.checkInTime);
          setForgottenTime(
            ci.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false }),
          );
        }
      } catch {
        // No forgotten session — proceed normally
      }
    };
    void check();
  }, [phase]);

  const handleForgottenSubmit = async () => {
    if (!forgotten) return;
    setSubmittingForgotten(true);
    setError('');
    try {
      const [hours, minutes] = forgottenTime.split(':').map(Number);
      const checkoutDate = new Date(forgotten.checkInTime);
      checkoutDate.setHours(hours, minutes, 0, 0);
      await post('/attendance/checkout/self-report', {
        date: forgotten.date,
        reportedCheckOutTime: checkoutDate.toISOString(),
      });
      setForgotten(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve');
    } finally {
      setSubmittingForgotten(false);
    }
  };

  const doCheckIn = async () => {
    setError('');
    setLocal('processing');
    try {
      const res = await post<{
        attendanceLog: { id: string; status: string; checkInTime: string };
      }>('/attendance/check-in', {});
      setLocal('success');
      setTimeout(() => {
        setLocal('checked-in');
        onCheckedIn(res.attendanceLog);
      }, 2000);
    } catch (err) {
      setLocal('idle');
      setError(err instanceof ApiError ? err.message : 'Check-in failed');
    }
  };

  const doCheckOut = async () => {
    setError('');
    setLocal('processing');
    try {
      const res = await post<{
        attendanceLog: { id: string; status: string; checkOutTime: string };
      }>('/attendance/check-out', {});
      setLocal('success');
      setTimeout(() => {
        setLocal('checked-out');
        onCheckedOut(res.attendanceLog);
      }, 2000);
    } catch (err) {
      setLocal('checked-in');
      setError(err instanceof ApiError ? err.message : 'Check-out failed');
    }
  };

  const isAttachee = role === 'ATTACHEE';

  // ── Forgotten checkout flow ──
  if (forgotten) {
    return (
      <div className="rounded-2xl border border-sph-amber/30 surface p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sph-amber/10">
            <AlertTriangle className="h-6 w-6 text-sph-amber" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            You didn&apos;t check out on{' '}
            {forgotten.date
              ? new Date(forgotten.date + 'T00:00:00').toLocaleDateString('en-KE', {
                  day: 'numeric',
                  month: 'short',
                })
              : 'a previous day'}
          </h2>
          <p className="text-sm text-muted">What time did you leave?</p>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={forgottenTime}
              onChange={(e) => setForgottenTime(e.target.value)}
              className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-[var(--text-primary)]"
            />
            <button
              type="button"
              disabled={submittingForgotten || !forgottenTime}
              onClick={handleForgottenSubmit}
              className="flex h-11 items-center gap-2 rounded-xl bg-sph-green px-5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {submittingForgotten ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
            </button>
          </div>
          {error && <p className="text-sm text-sph-red">{error}</p>}
        </div>
      </div>
    );
  }

  // ── State E: Checked out / day complete ──
  if (local === 'checked-out') {
    return (
      <div className="rounded-2xl border border-[var(--border)] surface p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/30">
              <Check className="h-5 w-5 text-muted" />
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">Day Complete</p>
          </div>
          <p className="text-xs text-muted">
            In {formatTime(checkInTime)} &middot; Out {formatTime(checkOutTime)}
          </p>
          {status && (
            <span
              className={`inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${statusBadgeClass(status)}`}
            >
              {statusLabel(status)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── State D: Checked in, active session ──
  if (local === 'checked-in') {
    return (
      <div className="rounded-2xl border border-[var(--border)] surface p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <button type="button" onClick={doCheckOut} className="flex flex-col items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sph-amber/20 transition-all hover:bg-sph-amber/30 active:scale-95">
              <LogOut className="h-5 w-5 text-sph-amber" />
            </div>
            <span className="text-2xl font-bold text-[var(--text-primary)]">Check Out</span>
          </button>
          <p className="text-xs text-muted">
            In {formatTime(checkInTime)} &middot; {statusLabel(status)}
          </p>
          {isAttachee && (
            <Link
              href="/dashboard/worklog"
              className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]"
            >
              Fill Daily Log
            </Link>
          )}
          {error && <p className="text-sm text-sph-red">{error}</p>}
        </div>
      </div>
    );
  }

  // ── State C: Just succeeded (brief checkmark) ──
  if (local === 'success') {
    const isCheckIn = phase === 'idle';
    return (
      <div className="rounded-2xl border border-sph-green/20 surface p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sph-green/20">
            <Check className="h-6 w-6 text-sph-green" />
          </div>
          <p className="text-sm text-muted">
            {isCheckIn
              ? `Checked in at ${formatTime(checkInTime)} \u00B7 ${statusLabel(status)}`
              : `Checked out at ${formatTime(checkOutTime)} \u00B7 ${statusLabel(status)}`}
          </p>
        </div>
      </div>
    );
  }

  // ── State B: Processing ──
  if (local === 'processing') {
    return (
      <div className="rounded-2xl border border-[var(--border)] surface p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sph-green/10">
            <Loader2 className="h-5 w-5 animate-spin text-sph-green" />
          </div>
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {phase === 'idle' ? 'Checking in...' : 'Checking out...'}
          </span>
        </div>
      </div>
    );
  }

  // ── State A: Ready to check in ──
  return (
    <div className="rounded-2xl border border-[var(--border)] surface p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <button type="button" onClick={doCheckIn} className="flex flex-col items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full bg-sph-green/20 transition-all hover:bg-sph-green/30 active:scale-95 ${
              phase === 'idle' && local === 'idle'
                ? 'shadow-[0_0_0_0_rgba(16,185,129,0.4)] animate-pulse'
                : ''
            }`}
          >
            <LogIn className="h-5 w-5 text-sph-green" />
          </div>
          <span className="text-2xl font-bold text-[var(--text-primary)]">Check In</span>
        </button>
        {error && <p className="text-sm text-sph-red">{error}</p>}
      </div>
    </div>
  );
}
