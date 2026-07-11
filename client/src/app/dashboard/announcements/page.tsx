'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Megaphone, Info, AlertTriangle } from 'lucide-react';
import { get } from '@/lib/api';

interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
}

interface AnnouncementsData {
  announcements: Announcement[];
}

function categoryIcon(cat: string) {
  switch (cat) {
    case 'CRITICAL':
      return AlertTriangle;
    case 'DEPARTMENT':
      return Info;
    default:
      return Megaphone;
  }
}

function categoryColor(cat: string): string {
  switch (cat) {
    case 'CRITICAL':
      return 'text-sph-red bg-sph-red/10';
    case 'DEPARTMENT':
      return 'text-sph-blue bg-sph-blue/10';
    default:
      return 'text-sph-green bg-sph-green/10';
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

export default function AnnouncementsPage() {
  const [data, setData] = useState<AnnouncementsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<AnnouncementsData>('/announcements')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <h1 className="text-2xl font-bold text-[var(--text-primary)]">Announcements</h1>

      {loading ? (
        <div className="mt-6 flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-elevated)]" />
          ))}
        </div>
      ) : !data || data.announcements.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/30">
            <Megaphone className="h-7 w-7 text-muted" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">No announcements yet</h2>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {data.announcements.map((a) => {
            const Icon = categoryIcon(a.category);
            return (
              <div
                key={a.id}
                className="rounded-2xl border border-[var(--border)] surface p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${categoryColor(a.category)}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{a.title}</p>
                      <span className="text-xs text-muted">{timeAgo(a.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted">{a.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
