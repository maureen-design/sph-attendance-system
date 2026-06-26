'use client';

import { useEffect, useCallback, useState } from 'react';
import Link from 'next/link';
import { Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CheckInButton, type CheckInPhase } from '@/components/dashboard/CheckInButton';
import { WeekStrip, type WeekDay } from '@/components/dashboard/WeekStrip';
import { ScoreRing } from '@/components/dashboard/ScoreRing';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';

// ── Types matching backend response shapes ──

interface BackendAttendanceLog {
  id: string;
  userId: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
}

interface DashboardData {
  user: {
    fullName: string;
    role: string;
    department: { id: string; name: string } | null;
  };
  today: BackendAttendanceLog | null;
  streak: number;
  attendanceScore: number;
  thisWeek: BackendAttendanceLog[];
  recentHistory: BackendAttendanceLog[];
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

// ── Helpers ──

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildWeekDays(logs: BackendAttendanceLog[]): WeekDay[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const todayStr = new Date().toISOString().split('T')[0];
  const days: WeekDay[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1 + i);
    const dateStr = d.toISOString().split('T')[0];
    const log = byDate.get(dateStr);
    days.push({
      day: DAY_NAMES[i],
      date: dateStr,
      status: log?.status ?? null,
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

function getPhaseFromLog(log: BackendAttendanceLog | null): CheckInPhase {
  if (!log) return 'idle';
  if (log.checkOutTime) return 'checked-out';
  return 'checked-in';
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

function CheckInButtonSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Skeleton className="h-20 w-20 rounded-full bg-[var(--surface-elevated)]" />
      <Skeleton className="h-4 w-24 rounded bg-[var(--surface-elevated)]" />
    </div>
  );
}

// ── Page ──

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check-in state (can be updated optimistically)
  const [phase, setPhase] = useState<CheckInPhase>('idle');
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [dashData, annData] = await Promise.all([
        get<DashboardData>('/dashboard/personal'),
        get<AnnouncementsData>('/announcements'),
      ]);
      setData(dashData);
      if (annData) setAnnouncements(annData);

      // Initialize check-in state from today's log
      const log = dashData.today;
      if (log) {
        setPhase(getPhaseFromLog(log));
        setCheckInStatus(log.status);
        setCheckInTime(log.checkInTime);
        setCheckOutTime(log.checkOutTime);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckedIn = (log: { id: string; status: string; checkInTime: string }) => {
    setPhase('checked-in');
    setCheckInStatus(log.status);
    setCheckInTime(log.checkInTime);
  };

  const handleCheckedOut = (log: { id: string; status: string; checkOutTime: string }) => {
    setPhase('checked-out');
    setCheckOutTime(log.checkOutTime);
  };

  const firstName = data?.user?.fullName?.split(' ')[0] ?? authUser?.fullName?.split(' ')[0] ?? '';

  const subtitle = data?.user?.department?.name ?? '';
  const weekDays = data?.thisWeek ? buildWeekDays(data.thisWeek) : [];

  // Error state
  if (error && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sph-red/10">
          <AlertTriangle className="h-7 w-7 text-sph-red" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Failed to load dashboard
        </h2>
        <p className="max-w-sm text-center text-sm text-muted">{error}</p>
        <Button variant="outline" onClick={fetchData} className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

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
                {firstName ? `Habari, ${firstName}` : 'Habari'}
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
          <CheckInButtonSkeleton />
        ) : (
          <CheckInButton
            phase={phase}
            status={checkInStatus}
            checkInTime={checkInTime}
            checkOutTime={checkOutTime}
            onCheckedIn={handleCheckedIn}
            onCheckedOut={handleCheckedOut}
            role={data?.user.role ?? authUser?.role ?? ''}
            departmentShiftEnd={undefined}
            checkInTimeIso={checkInTime}
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
          <WeekStrip days={weekDays} />
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
              <p className="flex items-center gap-1 text-2xl font-bold text-[var(--text-primary)]">
                <Zap className="h-4 w-4 text-sph-amber" /> {data?.streak ?? 0}
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
