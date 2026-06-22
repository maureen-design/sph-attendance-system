'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckInButton, type CheckInPhase } from '@/components/dashboard/CheckInButton';
import { WeekStrip } from '@/components/dashboard/WeekStrip';
import { ScoreRing } from '@/components/dashboard/ScoreRing';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';

// ── Types ──

interface DashboardData {
  user: {
    fullName: string;
    email: string;
    role: string;
    department?: { name: string };
    cohort?: { name: string };
  };
  today: {
    log: {
      id: string;
      status: string;
      checkInTime: string | null;
      checkOutTime: string | null;
    } | null;
  };
  streak: number;
  attendanceScore: number;
  thisWeek: Array<{
    day: string;
    date: string;
    status: string | null;
    isToday: boolean;
  }>;
  recentHistory: Array<{ id: string; date: string; status: string }>;
}

interface AnnouncementsData {
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    createdAt: string;
  }>;
}

// ── Skeleton loaders ──

function GreetingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48 rounded-lg bg-[var(--surface-elevated)]" />
      <Skeleton className="h-4 w-32 rounded bg-[var(--surface-elevated)]" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl surface p-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full bg-[var(--surface-elevated)]" />
        <Skeleton className="h-4 w-32 rounded bg-[var(--surface-elevated)]" />
      </div>
    </div>
  );
}

// ── Page ──

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check-in state (can be updated optimistically)
  const [phase, setPhase] = useState<CheckInPhase>('idle');
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      get<DashboardData>('/dashboard/personal').catch(() => null),
      get<AnnouncementsData>('/announcements').catch(() => null),
    ]).then(([dashData, annData]) => {
      if (dashData) {
        setData(dashData);
        // Initialize check-in state from today's log
        const log = dashData.today.log;
        if (log) {
          if (log.checkOutTime) {
            setPhase('checked-out');
          } else {
            setPhase('checked-in');
          }
          setCheckInStatus(log.status);
          setCheckInTime(log.checkInTime);
          setCheckOutTime(log.checkOutTime);
        }
      }
      if (annData) setAnnouncements(annData);
      setIsLoading(false);
    });
  }, []);

  const handleCheckedIn = (log: { id: string; status: string; checkInTime: string }) => {
    setPhase('checked-in');
    setCheckInStatus(log.status);
    setCheckInTime(log.checkInTime);
  };

  const firstName =
    data?.user.fullName?.split(' ')[0] ?? authUser?.fullName?.split(' ')[0] ?? 'User';
  const department = data?.user.department?.name ?? '';
  const cohort = data?.user.cohort?.name;
  const subtitle = [department, cohort].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-6">
      {/* ── Section A: Greeting ── */}
      <div>
        {isLoading ? (
          <GreetingSkeleton />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                Habari, {firstName}
              </h1>
              <span
                className={`h-2.5 w-2.5 rounded-full ${data ? 'bg-sph-green' : 'bg-sph-amber'}`}
                title={data ? 'Connected' : 'Syncing'}
              />
            </div>
            {subtitle && <p className="text-sm text-secondary">{subtitle}</p>}
          </>
        )}
      </div>

      {/* ── Section B: Check-In Card ── */}
      <div className="rounded-2xl surface p-6">
        {isLoading ? (
          <CardSkeleton />
        ) : (
          <CheckInButton
            phase={phase}
            status={checkInStatus}
            checkInTime={checkInTime}
            checkOutTime={checkOutTime}
            onCheckedIn={handleCheckedIn}
          />
        )}
      </div>

      {/* ── Section C: Week Strip ── */}
      <div className="rounded-2xl surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">This Week</h2>
        {isLoading ? (
          <div className="flex justify-between">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-8 rounded-full bg-[var(--surface-elevated)]" />
            ))}
          </div>
        ) : (
          <WeekStrip days={data?.thisWeek ?? []} />
        )}
      </div>

      {/* ── Section D: Metrics ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Streak */}
        <div className="rounded-2xl surface p-5">
          {isLoading ? (
            <Skeleton className="h-16 rounded-lg bg-[var(--surface-elevated)]" />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                🔥 {data?.streak ?? 0}
              </p>
              <p className="text-xs text-muted">
                {(data?.streak ?? 0) > 0 ? 'days on time' : 'Start your streak today'}
              </p>
            </div>
          )}
        </div>

        {/* Score */}
        <div className="flex items-center gap-4 rounded-2xl surface p-5">
          {isLoading ? (
            <Skeleton className="h-16 w-16 rounded-full bg-[var(--surface-elevated)]" />
          ) : (
            <>
              <ScoreRing score={data?.attendanceScore ?? 0} />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {data?.attendanceScore ?? 0}%
                </p>
                <p className="text-xs text-muted">Attendance score</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Section E: Announcements ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
            {announcements && (
              <span className="rounded-full bg-sph-green/20 px-2 py-0.5 text-[10px] font-bold text-sph-green">
                {announcements.announcements.length}
              </span>
            )}
          </div>
          <Link href="/dashboard/announcements" className="text-xs text-sph-blue hover:underline">
            View all →
          </Link>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl bg-[var(--surface-elevated)]" />
            ))}
          </div>
        ) : (
          <AnnouncementCard announcements={announcements?.announcements.slice(0, 3) ?? []} />
        )}
      </div>
    </div>
  );
}
