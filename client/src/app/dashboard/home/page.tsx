'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useHomeDashboard } from '@/lib/hooks/useHomeDashboard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AttacheeHero, type HeroPhase } from '@/components/dashboard/AttacheeHero';
import { PortfolioMetrics } from '@/components/dashboard/PortfolioMetrics';
import { TodayProgress } from '@/components/dashboard/TodayProgress';
import { RecentAttendanceTable } from '@/components/dashboard/RecentAttendanceTable';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';

const ALLOWED_ROLES = ['STAFF', 'MEMBER'];

function GreetingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-48 rounded-lg bg-[var(--surface-elevated)]" />
      <Skeleton className="h-4 w-32 rounded bg-[var(--surface-elevated)]" />
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

export default function HomePage() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const role = authUser?.role ?? '';

  const {
    data,
    announcements,
    isLoading,
    error,
    phase,
    checkInStatus,
    checkInTime,
    checkOutTime,
    firstName,
    greetingSubtitle,
    shiftInfo,
    fetchData,
    handleCheckedIn,
    handleCheckedOut,
  } = useHomeDashboard();

  useEffect(() => {
    if (!authUser) return;
    if (!ALLOWED_ROLES.includes(role)) {
      router.replace('/dashboard');
    }
  }, [authUser, role, router]);

  if (!authUser || !ALLOWED_ROLES.includes(role)) return null;

  const heroPhase: HeroPhase =
    phase === 'checked-out' ? 'checked-out' : phase === 'checked-in' ? 'checked-in' : 'idle';

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

  const userStatus = data?.user?.status;

  // Pending approval
  if (userStatus === 'PENDING_APPROVAL') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Habari, {firstName}
          </h1>
          {greetingSubtitle && <p className="text-sm text-secondary">{greetingSubtitle}</p>}
          {shiftInfo && <p className="mt-0.5 text-xs text-muted">{shiftInfo}</p>}
        </div>
        <div className="flex flex-col items-center gap-4 rounded-2xl surface p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-amber/10">
            <AlertTriangle className="h-8 w-8 text-sph-amber" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Account Pending Approval
          </h2>
          <p className="max-w-sm text-sm text-secondary">
            Your registration is awaiting review by a supervisor. You will be notified once your
            account is activated.
          </p>
        </div>
        {announcements && announcements.announcements.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
            </div>
            <AnnouncementCard announcements={announcements.announcements.slice(0, 2)} />
          </div>
        )}
      </div>
    );
  }

  // Rejected
  if (userStatus === 'REJECTED') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
            Habari, {firstName}
          </h1>
          {greetingSubtitle && <p className="text-sm text-secondary">{greetingSubtitle}</p>}
          {shiftInfo && <p className="mt-0.5 text-xs text-muted">{shiftInfo}</p>}
        </div>
        <div className="flex flex-col items-center gap-4 rounded-2xl surface p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sph-red/10">
            <AlertTriangle className="h-8 w-8 text-sph-red" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Registration Rejected
          </h2>
          <p className="max-w-sm text-sm text-secondary">
            Your registration was not approved. Please contact your supervisor for more information.
          </p>
        </div>
        {announcements && announcements.announcements.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
            </div>
            <AnnouncementCard announcements={announcements.announcements.slice(0, 2)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div>
        {isLoading ? (
          <GreetingSkeleton />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {firstName ? `Habari, ${firstName}` : 'Habari'}
              </h1>
              <span className="h-2.5 w-2.5 rounded-full bg-sph-green" title="Connected" />
            </div>
            {greetingSubtitle && <p className="text-sm text-secondary">{greetingSubtitle}</p>}
            {shiftInfo && <p className="mt-0.5 text-xs text-muted">{shiftInfo}</p>}
          </>
        )}
      </div>

      {/* Hero Check-In Card */}
      {isLoading ? (
        <CheckInButtonSkeleton />
      ) : (
        <AttacheeHero
          phase={heroPhase}
          status={checkInStatus}
          checkInTime={checkInTime}
          checkOutTime={checkOutTime}
          onCheckedIn={handleCheckedIn}
          onCheckedOut={handleCheckedOut}
          role={role}
          hideDailyLog
        />
      )}

      {/* Today's Progress */}
      {!isLoading && (
        <TodayProgress
          checkInTime={checkInTime}
          checkOutTime={checkOutTime}
          hasWorkLog={false}
          phase={phase}
          hideWorkLog
        />
      )}

      {/* Portfolio Metrics */}
      {!isLoading && (
        <PortfolioMetrics
          attendanceScore={data?.attendanceScore ?? 0}
          streak={data?.streak ?? 0}
          attendanceBreakdown={data?.attendanceBreakdown}
          showLogbooks={false}
        />
      )}

      {/* Recent Attendance */}
      {!isLoading && data?.recentHistory && data.recentHistory.length > 0 && (
        <RecentAttendanceTable logs={data.recentHistory} />
      )}

      {/* Empty state when no history yet */}
      {!isLoading && data && (!data.recentHistory || data.recentHistory.length === 0) && (
        <div className="flex flex-col items-center gap-3 rounded-2xl surface py-10 text-center">
          <CheckCircle className="h-10 w-10 text-sph-green" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            No attendance history yet
          </p>
          <p className="text-xs text-muted">Your attendance records will appear here.</p>
        </div>
      )}

      {/* Announcements */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
          <Link href="/dashboard/announcements" className="text-xs text-sph-blue hover:underline">
            View all →
          </Link>
        </div>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map((i) => (
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
