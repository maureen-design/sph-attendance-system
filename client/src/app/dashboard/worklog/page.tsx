'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Check, ArrowLeft, AlertTriangle } from 'lucide-react';
import { get, post, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

interface ExistingLog {
  id: string;
  date: string;
  summary: string;
  progress: string;
  blockers: string | null;
  needsHelp: boolean;
  supervisorNote: string | null;
}

function formatDateForInput(iso: string): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export default function WorkLogPage() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedDate = searchParams.get('date') ?? '';

  const isAttachee = authUser?.role === 'ATTACHEE';

  const [date, setDate] = useState(preselectedDate || todayStr());
  const [summary, setSummary] = useState('');
  const [progress, setProgress] = useState('');
  const [blockers, setBlockers] = useState('');
  const [needsHelp, setNeedsHelp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [existing, setExisting] = useState<ExistingLog | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Fetch existing log for the selected date
  const fetchExisting = useCallback(async () => {
    setLoadingExisting(true);
    setExisting(null);
    try {
      const res = await get<{ logs: ExistingLog[] }>(`/worklogs/my?month=${date.slice(0, 7)}`);
      const found = res.logs.find((l) => formatDateForInput(l.date) === date);
      if (found) {
        setExisting(found);
        setSummary(found.summary);
        setProgress(found.progress);
        setBlockers(found.blockers ?? '');
        setNeedsHelp(found.needsHelp);
      }
    } catch {
      // No logs yet - fine
    } finally {
      setLoadingExisting(false);
    }
  }, [date]);

  useEffect(() => {
    if (date) void fetchExisting();
  }, [date, fetchExisting]);

  // Redirect non-attachee
  useEffect(() => {
    if (authUser && !isAttachee) {
      router.replace('/dashboard');
    }
  }, [authUser, isAttachee, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !progress.trim()) {
      setError('Summary and progress are required');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await post('/worklogs', {
        date,
        summary: summary.trim(),
        progress: progress.trim(),
        blockers: blockers.trim() || undefined,
        needsHelp,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save work log');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAttachee) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertTriangle className="h-8 w-8 text-sph-amber" />
        <p className="text-muted">Only attachees can access this page.</p>
        <Link href="/dashboard" className="text-sm text-sph-blue hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-green/20">
          <Check className="h-8 w-8 text-sph-green" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Work log saved!</h1>
          <p className="mt-1 text-sm text-muted">{date}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setSuccess(false);
              setSummary('');
              setProgress('');
              setBlockers('');
              setNeedsHelp(false);
              setDate(todayStr());
              setExisting(null);
            }}
            className="rounded-xl bg-[var(--surface-elevated)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:brightness-110"
          >
            Add another
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl bg-sph-green px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Daily Work Log</h1>
      <p className="mt-1 text-sm text-muted">Record your daily activities and progress.</p>

      {existing && (
        <div className="mt-4 rounded-2xl border border-sph-amber/20 bg-sph-amber/[0.04] px-4 py-3 text-sm text-sph-amber">
          A log already exists for this date. You cannot overwrite it.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        {/* Date */}
        <div>
          <label
            htmlFor="wl-date"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Date
          </label>
          <input
            id="wl-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={loadingExisting || !!existing}
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm text-[var(--text-primary)] disabled:opacity-60"
          />
        </div>

        {/* Summary */}
        <div>
          <label
            htmlFor="wl-summary"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            What did you do today?
          </label>
          <textarea
            id="wl-summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief summary of your work today..."
            disabled={!!existing}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-muted disabled:opacity-60"
          />
        </div>

        {/* Progress */}
        <div>
          <label
            htmlFor="wl-progress"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Progress
          </label>
          <textarea
            id="wl-progress"
            rows={4}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            placeholder="What progress did you make? Any achievements or milestones?"
            disabled={!!existing}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-muted disabled:opacity-60"
          />
        </div>

        {/* Blockers */}
        <div>
          <label
            htmlFor="wl-blockers"
            className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]"
          >
            Blockers <span className="text-muted">(optional)</span>
          </label>
          <textarea
            id="wl-blockers"
            rows={2}
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Any challenges or blockers?"
            disabled={!!existing}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-muted disabled:opacity-60"
          />
        </div>

        {/* Needs Help toggle */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={needsHelp}
            onChange={(e) => setNeedsHelp(e.target.checked)}
            disabled={!!existing}
            className="h-5 w-5 rounded-md border-[var(--border)] text-sph-green focus:ring-sph-green disabled:opacity-60"
          />
          <span className="text-sm text-[var(--text-primary)]">
            I need help / follow-up on this
          </span>
        </label>

        {error && <p className="text-sm text-sph-red">{error}</p>}

        {!existing && (
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-sph-green px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sph-green/25 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Work Log'
            )}
          </button>
        )}
      </form>
    </div>
  );
}
