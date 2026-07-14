'use client';

interface AttendanceBreakdown {
  present: number;
  late: number;
  absent: number;
  total: number;
}

interface PortfolioMetricsProps {
  attendanceScore: number;
  streak: number;
  attendanceBreakdown?: AttendanceBreakdown;
  logbookCount?: number;
  reviewedCount?: number;
  showLogbooks?: boolean;
}

export function PortfolioMetrics({
  attendanceScore,
  streak,
  attendanceBreakdown,
  logbookCount,
  reviewedCount,
  showLogbooks = true,
}: PortfolioMetricsProps) {
  const metrics = [
    {
      label: 'Attendance',
      value: `${attendanceScore}%`,
      sub: attendanceBreakdown
        ? `${attendanceBreakdown.present} Present, ${attendanceBreakdown.late} Late, ${attendanceBreakdown.absent} Absent`
        : 'No data',
      color:
        attendanceScore >= 80
          ? 'text-sph-green'
          : attendanceScore >= 50
            ? 'text-sph-amber'
            : 'text-sph-red',
    },
    {
      label: 'Streak',
      value: `${streak}`,
      sub: streak === 1 ? 'day' : `${streak} days`,
      color: streak >= 5 ? 'text-sph-green' : 'text-[var(--text-primary)]',
    },
    ...(showLogbooks && typeof logbookCount === 'number'
      ? [
          {
            label: 'Logbooks',
            value: `${logbookCount}`,
            sub: typeof reviewedCount === 'number' ? `${reviewedCount} reviewed` : 'entries',
            color: 'text-[var(--text-primary)]' as const,
          },
        ]
      : []),
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-[var(--text-primary)]">
        Portfolio
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-[var(--border)] surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="mb-1 text-xs text-muted">{m.label}</p>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="mt-0.5 text-xs text-muted">{m.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
