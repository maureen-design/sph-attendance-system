'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get, post, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type LeaveType = 'SICK' | 'EMERGENCY' | 'OFFICIAL_DUTY' | 'OTHER';
type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface LeaveRecord {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  decidedBy: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  decider: { id: string; fullName: string } | null;
}

const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  SICK: 'Sick Leave',
  EMERGENCY: 'Emergency',
  OFFICIAL_DUTY: 'Official Duty',
  OTHER: 'Other',
};

const STATUS_STYLES: Record<LeaveStatus, string> = {
  PENDING: 'bg-sph-amber/10 text-sph-amber border-sph-amber/20',
  APPROVED: 'bg-sph-green/10 text-sph-green border-sph-green/20',
  REJECTED: 'bg-sph-red/10 text-sph-red border-sph-red/20',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function LeavePage() {
  const { user: authUser } = useAuth();
  const role = authUser?.role ?? '';

  const [type, setType] = useState<LeaveType>('SICK');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRecord[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const fetchLeaves = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const res = await get<{ leaves: LeaveRecord[] }>('/leaves/my');
      setLeaves(res.leaves);
    } catch {
      setHistoryError('Failed to load leave history');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !startDate || !endDate || !reason.trim()) return;
    if (reason.trim().length < 10) {
      setSubmitError('Reason must be at least 10 characters');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setSubmitError('End date must not be before start date');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      await post('/leaves', { type, startDate, endDate, reason: reason.trim() });
      setSubmitSuccess(true);
      setType('SICK');
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaves();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Leave Request</h1>
        <p className="mt-1 text-sm text-secondary">
          Submit a new leave request or view your leave history
        </p>
      </div>

      {/* Submit Form */}
      <div className="rounded-2xl border border-[var(--border)] surface p-6">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          New Leave Request
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-primary)]">Leave Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
              className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
            >
              {Object.entries(LEAVE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-primary)]">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={todayStr}
                required
                className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text-primary)]">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || todayStr}
                required
                className="h-11 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-primary)]">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for your leave request (min. 10 characters)"
              rows={4}
              required
              className="resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-muted focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
            />
          </div>

          {submitError && (
            <div className="flex items-center gap-2 text-sm text-sph-red">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="flex items-center gap-2 text-sm text-sph-green">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Leave request submitted successfully!</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !type || !startDate || !endDate || !reason.trim()}
            className="self-start"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Leave Request'
            )}
          </Button>
        </form>
      </div>

      {/* Leave History */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
          Leave History
        </h2>

        {loadingHistory ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl bg-[var(--surface-elevated)]" />
            ))}
          </div>
        ) : historyError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl surface py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-sph-red" />
            <p className="text-sm text-muted">{historyError}</p>
            <Button variant="outline" size="sm" onClick={fetchLeaves}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : leaves && leaves.length > 0 ? (
          <div className="flex flex-col gap-3">
            {leaves.map((leave) => (
              <div
                key={leave.id}
                className="rounded-2xl border border-[var(--border)] surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {LEAVE_TYPE_LABELS[leave.type]}
                      </p>
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[leave.status]}`}
                      >
                        {leave.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(leave.startDate)} — {formatDate(leave.endDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(leave.createdAt).toLocaleDateString('en-KE', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-secondary line-clamp-2">{leave.reason}</p>
                    {leave.decisionNote && (
                      <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-muted">
                        <span className="font-medium text-[var(--text-primary)]">
                          {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                        </span>
                        {leave.decider && <> by {leave.decider.fullName}</>}: {leave.decisionNote}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {leave.status === 'APPROVED' && (
                      <CheckCircle className="h-5 w-5 text-sph-green" />
                    )}
                    {leave.status === 'REJECTED' && <XCircle className="h-5 w-5 text-sph-red" />}
                    {leave.status === 'PENDING' && <Clock className="h-5 w-5 text-sph-amber" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl surface py-10 text-center">
            <Calendar className="h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-[var(--text-primary)]">No leave requests yet</p>
            <p className="text-xs text-muted">
              Submit your first leave request using the form above.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
