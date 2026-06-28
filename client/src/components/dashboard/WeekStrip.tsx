export interface WeekDay {
  day: string;
  date: string;
  status: string | null;
  isToday: boolean;
}

interface WeekStripProps {
  days: WeekDay[];
}

function getStatusColor(status: string | null): string {
  if (!status) return 'surface-elevated border border-[var(--border)]';
  switch (status) {
    case 'EARLY':
    case 'ON_TIME':
    case 'LEFT_EARLY':
      return 'bg-sph-green';
    case 'LATE':
      return 'bg-sph-amber';
    case 'ABSENT_EXCUSED':
    case 'ABSENT_UNEXCUSED':
    case 'ABSENT_EXCUSE_PENDING':
    case 'UNRESOLVED':
      return 'bg-sph-red';
    case 'DISPUTED':
      return 'bg-sph-neutral';
    default:
      return 'surface-elevated border border-[var(--border)]';
  }
}

export function WeekStrip({ days }: WeekStripProps) {
  return (
    <div className="flex items-center justify-between">
      {days.map((d) => (
        <div key={d.date} className="flex flex-col items-center gap-1.5">
          <div
            title={`${d.date} — ${d.status ?? 'No record'}`}
            className={`h-8 w-8 rounded-full ${getStatusColor(d.status)} ${
              d.isToday ? 'ring-2 ring-sph-green ring-offset-2 ring-offset-[var(--background)]' : ''
            } flex items-center justify-center transition-colors`}
          />
          <span className="text-[10px] text-muted">{d.day}</span>
        </div>
      ))}
    </div>
  );
}
