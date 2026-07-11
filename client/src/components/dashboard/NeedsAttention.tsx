'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';

interface MissingDay {
  date: string;
}

interface NeedsAttentionProps {
  missingDays: MissingDay[];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function NeedsAttention({ missingDays }: NeedsAttentionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!missingDays || missingDays.length === 0) return null;

  const total = missingDays.length;
  const preview = missingDays.slice(0, 3);
  const hasMore = total > 3;

  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
        Needs Attention
      </h2>
      <div className="rounded-2xl border border-sph-amber/20 bg-sph-amber/[0.04] p-4">
        {/* Summary row */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sph-amber/10">
            <AlertTriangle className="h-5 w-5 text-sph-amber" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {total} missing {total === 1 ? 'logbook' : 'logbooks'}
            </p>
            <p className="text-xs text-muted">
              {preview.map((d) => formatDate(d.date)).join(', ')}
              {hasMore && !expanded && ' +more'}
            </p>
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-sph-blue transition-colors hover:text-sph-blue/80"
            >
              {expanded ? 'Less' : 'All'}
              <ChevronRight
                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            </button>
          )}
        </div>

        {/* Expanded cards */}
        {expanded && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {missingDays.map((day) => (
              <Link
                key={day.date}
                href={`/dashboard/worklog?date=${day.date}`}
                className="flex shrink-0 flex-col items-center gap-1 rounded-xl border border-sph-amber/20 bg-sph-amber/[0.06] px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-sph-amber/40 hover:shadow-lg hover:shadow-sph-amber/5"
              >
                <p className="whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">
                  {formatDate(day.date)}
                </p>
                <p className="text-xs text-muted">No log entry</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
