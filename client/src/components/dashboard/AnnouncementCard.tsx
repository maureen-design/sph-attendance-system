interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
}

interface AnnouncementCardProps {
  announcements: Announcement[];
}

function categoryColor(category: string): string {
  switch (category) {
    case 'CRITICAL':
      return 'bg-sph-red';
    case 'DEPARTMENT':
      return 'bg-sph-blue';
    default:
      return 'bg-sph-green';
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function AnnouncementCard({ announcements }: AnnouncementCardProps) {
  if (announcements.length === 0) {
    return <p className="text-sm text-secondary">No announcements yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {announcements.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-xl surface p-4">
          <div className={`mt-1 h-8 w-1 shrink-0 rounded-full ${categoryColor(a.category)}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{a.title}</p>
            <p className="mt-0.5 text-xs text-muted">{timeAgo(a.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
