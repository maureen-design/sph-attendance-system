'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { post, ApiError } from '@/lib/api';

// ── Types ──

export type CheckInPhase = 'idle' | 'checked-in' | 'checked-out';

interface CheckInButtonProps {
  phase: CheckInPhase;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  onCheckedIn: (log: { id: string; status: string; checkInTime: string }) => void;
  role: string;
}

interface CheckInResponse {
  attendanceLog: {
    id: string;
    status: string;
    checkInTime: string;
    date: string;
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
  if (status === 'LATE') return 'bg-sph-amber/20 text-sph-amber';
  return 'bg-sph-green/20 text-sph-green';
}

// ── Live clock ──

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="text-sm text-muted">
      {now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })}
    </p>
  );
}

// ── Component ──

export function CheckInButton({
  phase,
  status,
  checkInTime,
  checkOutTime,
  onCheckedIn,
}: CheckInButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCheckIn = async () => {
    if (!qrToken.trim()) return;
    setError('');
    setIsSubmitting(true);
    try {
      const res = await post<CheckInResponse>('/attendance/checkin', {
        qrToken: qrToken.trim(),
      });
      onCheckedIn(res.attendanceLog);
      setDialogOpen(false);
      setQrToken('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── CHECKED OUT ──
  if (phase === 'checked-out') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className={`rounded-full px-5 py-2 text-sm font-semibold ${statusBadgeClass(status)}`}>
          {status ?? 'Done'}
        </div>
        <p className="text-sm text-secondary">
          In: {formatTime(checkInTime)} · Out: {formatTime(checkOutTime)}
        </p>
        <p className="text-xs text-muted">You&apos;re all done for today!</p>
      </div>
    );
  }

  // ── CHECKED IN ──
  if (phase === 'checked-in') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className={`rounded-full px-5 py-2 text-sm font-semibold ${statusBadgeClass(status)}`}>
          Checked In · {status}
        </div>
        <p className="text-sm text-secondary">Checked in at {formatTime(checkInTime)}</p>
        <button
          type="button"
          onClick={() => {
            setDialogOpen(true);
            setQrToken('checkout');
          }}
          className="flex h-20 w-20 flex-col items-center justify-center rounded-full surface-elevated border border-[var(--border)] text-xs text-secondary transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          Check Out
        </button>
      </div>
    );
  }

  // ── IDLE (not checked in) ──
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-secondary">You haven&apos;t checked in yet</p>

      <button
        type="button"
        onClick={() => {
          setDialogOpen(true);
          setQrToken('');
        }}
        className="flex h-20 w-20 flex-col items-center justify-center rounded-full border-2 border-sph-green bg-sph-green/10 text-sph-green transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25 animate-pulse-glow"
      >
        <Fingerprint className="mb-0.5 h-6 w-6" />
        <span className="text-[10px] font-semibold">Check In</span>
      </button>

      <LiveClock />

      {/* QR Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check In</DialogTitle>
            <DialogDescription>Enter the QR token displayed at the door scanner.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qrToken">QR Token</Label>
              <Input
                id="qrToken"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder="Enter QR token"
                className="h-11 rounded-xl border-[var(--border)] surface-elevated px-4 text-[var(--text-primary)]"
              />
            </div>

            <p className="text-xs text-muted">
              In production, your camera will scan the door QR code automatically.
            </p>

            {error && (
              <div className="rounded-xl border border-sph-red/30 bg-sph-red/10 px-4 py-3 text-sm text-sph-red">
                {error}
              </div>
            )}

            <Button
              onClick={handleCheckIn}
              disabled={isSubmitting || !qrToken.trim()}
              className="h-11 w-full rounded-xl"
            >
              {isSubmitting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Checking in...
                </>
              ) : (
                'Confirm Check In'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
