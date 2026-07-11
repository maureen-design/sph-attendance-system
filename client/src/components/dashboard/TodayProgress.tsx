'use client';

import Link from 'next/link';
import { LogIn, LogOut, FileText, Clock } from 'lucide-react';

interface TodayProgressProps {
  checkInTime: string | null;
  checkOutTime: string | null;
  hasWorkLog: boolean;
  phase: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function TodayProgress({
  checkInTime,
  checkOutTime,
  hasWorkLog,
  phase,
}: TodayProgressProps) {
  const items = [
    {
      icon: LogIn,
      label: 'Check-in',
      status: checkInTime ? 'done' : 'pending',
      detail: checkInTime ? formatTime(checkInTime) : 'Not yet',
      done: !!checkInTime,
    },
    {
      icon: FileText,
      label: 'Work log',
      status: hasWorkLog ? 'done' : 'pending',
      detail: hasWorkLog ? (
        'Written'
      ) : (
        <Link href="/dashboard/worklog" className="text-sph-blue hover:underline">
          Not written
        </Link>
      ),
      done: hasWorkLog,
    },
    {
      icon: phase === 'checked-out' ? LogOut : Clock,
      label: 'Check-out',
      status: phase === 'checked-out' ? 'done' : phase === 'checked-in' ? 'pending' : 'pending',
      detail:
        phase === 'checked-out'
          ? formatTime(checkOutTime)
          : phase === 'checked-in'
            ? 'Pending'
            : 'Not yet',
      done: phase === 'checked-out',
    },
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
        Today&apos;s Progress
      </h2>
      <div className="rounded-2xl border border-[var(--border)] surface divide-y divide-[var(--border)]">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-3">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                item.done ? 'bg-sph-green/10' : 'bg-[var(--surface-elevated)]'
              }`}
            >
              <item.icon className={`h-4 w-4 ${item.done ? 'text-sph-green' : 'text-muted'}`} />
            </div>
            <p className="flex-1 text-sm text-[var(--text-primary)]">{item.label}</p>
            <p className={`text-sm ${item.done ? 'text-sph-green' : 'text-muted'}`}>
              {item.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
