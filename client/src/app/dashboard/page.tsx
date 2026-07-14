'use client';

import { useEffect, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Zap,
  RefreshCw,
  AlertTriangle,
  Shield,
  Clock,
  Users,
  Building2,
  UserCheck,
  UserX,
  MessageSquare,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckInButton, type CheckInPhase } from '@/components/dashboard/CheckInButton';
import { ScoreRing } from '@/components/dashboard/ScoreRing';
import { AnnouncementCard } from '@/components/dashboard/AnnouncementCard';
import { AttacheeHero, type HeroPhase } from '@/components/dashboard/AttacheeHero';
import { NeedsAttention } from '@/components/dashboard/NeedsAttention';
import { PortfolioMetrics } from '@/components/dashboard/PortfolioMetrics';
import { TodayProgress } from '@/components/dashboard/TodayProgress';
import { RecentAttendanceTable } from '@/components/dashboard/RecentAttendanceTable';

// ── Types matching backend response shapes ──

interface BackendAttendanceLog {
  id: string;
  userId: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkInMethod: string | null;
  checkOutMethod: string | null;
  status: string;
  hours: number | null;
}

interface DashboardData {
  user: {
    fullName: string;
    role: string;
    status: string;
    department: {
      id: string;
      name: string;
      shiftStart?: string;
      shiftEnd?: string;
    } | null;
    cohort: { id: string; name: string } | null;
  };
  today: BackendAttendanceLog | null;
  streak: number;
  attendanceScore: number;
  attendanceBreakdown?: { present: number; late: number; absent: number; total: number };
  thisWeek: BackendAttendanceLog[];
  recentHistory: BackendAttendanceLog[];
  gracePeriodMins?: number;
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

interface LiveDept {
  id: string;
  name: string;
  totalUsers: number;
  checkedIn: number;
  late: number;
  unresolved: number;
}

interface LiveData {
  departments: LiveDept[];
  lastUpdated: string;
}

interface SupervisorData {
  totalExpected: number;
  checkedIn: number;
  late: number;
  absent: number;
  unresolved: number;
  records: Array<{
    user: { id: string; fullName: string; role: string };
    log: BackendAttendanceLog | null;
    status: string;
  }>;
}

interface Dispute {
  id: string;
  reason: string;
  createdAt: string;
  user: { id: string; fullName: string };
}

interface DisputesData {
  disputes: Dispute[];
}

interface SupervisorIssue {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  type: 'attendance' | 'dispute' | 'leave';
  reason?: string;
  date?: string;
  createdAt: string;
}

interface EscalatedIssue {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  type: 'dispute' | 'leave';
  reason?: string;
  date?: string;
  createdAt: string;
}

// ── Helpers ──

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '--:--';
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function statusBadgeClass(status: string | null): string {
  if (!status) return 'bg-surface-elevated text-secondary';
  if (status === 'LATE' || status === 'LEFT_EARLY') return 'bg-sph-amber/20 text-sph-amber';
  if (status === 'UNRESOLVED') return 'bg-sph-red/20 text-sph-red';
  return 'bg-sph-green/20 text-sph-green';
}

function addMinutesToTime(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const rh = Math.floor(total / 60) % 24;
  const rm = total % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

function getPhaseFromLog(log: BackendAttendanceLog | null): CheckInPhase {
  if (!log) return 'idle';
  if (!log.checkInTime) return 'idle';
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

function CheckInButtonSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Skeleton className="h-20 w-20 rounded-full bg-[var(--surface-elevated)]" />
      <Skeleton className="h-4 w-24 rounded bg-[var(--surface-elevated)]" />
    </div>
  );
}

function CardSkeleton() {
  return <Skeleton className="h-24 w-full rounded-2xl bg-[var(--surface-elevated)]" />;
}

// ── Page ──

export default function DashboardPage() {
  const { user: authUser } = useAuth();
  const router = useRouter();
  const role = authUser?.role ?? '';

  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsData | null>(null);
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [deptData, setDeptData] = useState<SupervisorData | null>(null);
  const [disputes, setDisputes] = useState<DisputesData | null>(null);
  const [reviewItems, setReviewItems] = useState<SupervisorIssue[] | null>(null);
  const [escalatedItems, setEscalatedItems] = useState<EscalatedIssue[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Attachee-specific
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [logbookCount, setLogbookCount] = useState(0);
  const [hasWorkLog, setHasWorkLog] = useState(false);

  // Check-in state
  const [phase, setPhase] = useState<CheckInPhase>('idle');
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  const isAdmin = role === 'SUPER_ADMIN';
  const isSupervisor = role === 'DEPARTMENT_SUPERVISOR';
  const isRegular = !isAdmin && !isSupervisor;
  const isAttachee = role === 'ATTACHEE';
  const isStaffOrMember = role === 'STAFF' || role === 'MEMBER';

  useEffect(() => {
    if (isStaffOrMember) {
      router.replace('/dashboard/home');
    }
  }, [isStaffOrMember, router]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        // SUPER_ADMIN: org-wide stats + review/escalated items
        const [live, annData, reviewData, escalatedData] = await Promise.all([
          get<LiveData>('/dashboard/supervisor/live'),
          get<AnnouncementsData>('/announcements').catch(() => null),
          get<{ issues: SupervisorIssue[] }>('/dashboard/admin/review').catch(() => null),
          get<{ issues: EscalatedIssue[] }>('/dashboard/admin/escalated').catch(() => null),
        ]);
        setLiveData(live);
        setAnnouncements(annData);
        setReviewItems(reviewData?.issues ?? null);
        setEscalatedItems(escalatedData?.issues ?? null);
      } else if (isSupervisor) {
        // DEPARTMENT_SUPERVISOR: personal dashboard + dept stats
        const [dashData, dept, annData, disp] = await Promise.all([
          get<DashboardData>('/dashboard/personal'),
          get<SupervisorData>('/dashboard/supervisor'),
          get<AnnouncementsData>('/announcements').catch(() => null),
          get<DisputesData>('/disputes?status=OPEN'),
        ]);
        setData(dashData);
        setDeptData(dept);
        setAnnouncements(annData);
        setDisputes(disp);
        const log = dashData.today;
        if (log) {
          setPhase(getPhaseFromLog(log));
          setCheckInStatus(log.status);
          setCheckInTime(log.checkInTime);
          setCheckOutTime(log.checkOutTime);
        }
      } else {
        // STAFF/MEMBER/ATTACHEE: personal dashboard only
        const [dashData, annData] = await Promise.all([
          get<DashboardData>('/dashboard/personal'),
          get<AnnouncementsData>('/announcements').catch(() => null),
        ]);
        setData(dashData);
        setAnnouncements(annData);
        const log = dashData.today;
        if (log) {
          setPhase(getPhaseFromLog(log));
          setCheckInStatus(log.status);
          setCheckInTime(log.checkInTime);
          setCheckOutTime(log.checkOutTime);
        }
        if (isAttachee) {
          get<{ logs: Array<{ date: string }>; missingDays: string[] }>('/worklogs/my')
            .then((r) => {
              setMissingDays(r.missingDays);
              setLogbookCount(r.logs?.length ?? 0);
              const today = new Date().toISOString().split('T')[0];
              setHasWorkLog(r.logs?.some((l) => l.date?.startsWith(today)) ?? false);
            })
            .catch(() => {
              setMissingDays([]);
              setLogbookCount(0);
              setHasWorkLog(false);
            });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isSupervisor, isAttachee]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCheckedIn = (log: { id: string; status: string; checkInTime: string }) => {
    setPhase('checked-in');
    setCheckInStatus(log.status);
    setCheckInTime(log.checkInTime);
    fetchData();
  };

  const handleCheckedOut = (log: { id: string; status: string; checkOutTime: string }) => {
    setPhase('checked-out');
    setCheckOutTime(log.checkOutTime);
    fetchData();
  };

  const firstName = data?.user?.fullName?.split(' ')[0] ?? authUser?.fullName?.split(' ')[0] ?? '';

  const deptName = data?.user?.department?.name ?? '';
  const cohortName = data?.user?.cohort?.name ?? '';
  const shiftStart = data?.user?.department?.shiftStart ?? '';
  const shiftEnd = data?.user?.department?.shiftEnd ?? '';
  const gracePeriodMins = data?.gracePeriodMins ?? 15;

  const greetingSubtitle = deptName
    ? `${deptName} Department${cohortName ? ` · ${cohortName}` : ''} · ${new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : '';

  const shiftInfo = shiftStart
    ? `Shift starts at ${shiftStart} · Grace window closes at ${addMinutesToTime(shiftStart, gracePeriodMins)}`
    : '';

  // Computed live totals
  const liveTotals = liveData?.departments.reduce(
    (acc, d) => ({
      totalUsers: acc.totalUsers + d.totalUsers,
      checkedIn: acc.checkedIn + d.checkedIn,
      late: acc.late + d.late,
      unresolved: acc.unresolved + d.unresolved,
    }),
    { totalUsers: 0, checkedIn: 0, late: 0, unresolved: 0 },
  ) ?? { totalUsers: 0, checkedIn: 0, late: 0, unresolved: 0 };

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

  // ── SUPER ADMIN DASHBOARD ──
  if (isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        {/* Greeting */}
        <div>
          {isLoading ? (
            <GreetingSkeleton />
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sph-blue/10">
                <Shield className="h-5 w-5 text-sph-blue" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                  Habari, {firstName}
                </h1>
                <p className="text-sm text-muted">You have full access to manage SPH Attendance.</p>
              </div>
            </div>
          )}
        </div>

        {/* Org Overview Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm text-muted">
                  <Users className="h-3.5 w-3.5" /> Total Users
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {liveTotals.totalUsers}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm text-muted">
                  <UserCheck className="h-3.5 w-3.5" /> Active Today
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-bold text-sph-green">{liveTotals.checkedIn}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm text-muted">
                  <Building2 className="h-3.5 w-3.5" /> Departments
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-bold text-[var(--text-primary)]">
                  {liveData?.departments.length ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="flex items-center gap-1.5 text-sm text-muted">
                  <AlertTriangle className="h-3.5 w-3.5" /> Unresolved
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p
                  className={`text-2xl font-bold ${liveTotals.unresolved > 0 ? 'text-sph-red' : 'text-[var(--text-primary)]'}`}
                >
                  {liveTotals.unresolved}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Overview Link */}
        {!isLoading && (
          <Link
            href="/dashboard/overview"
            className="flex items-center justify-between rounded-2xl surface p-5 transition-colors hover:bg-[var(--surface-elevated)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sph-green/10">
                <Building2 className="h-5 w-5 text-sph-green" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Department Overview
                </p>
                <p className="text-xs text-muted">
                  Full department attendance breakdown and records
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted" />
          </Link>
        )}

        {/* Needs Your Review + Escalated */}
        {!isLoading && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Needs Your Review */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-sph-amber" /> Needs Your Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reviewItems && reviewItems.length > 0 ? (
                  <div className="space-y-3">
                    {reviewItems.slice(0, 10).map((item) => (
                      <div key={item.id} className="rounded-lg border border-[var(--border)] p-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {item.fullName}
                          </p>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              item.role === 'DEPARTMENT_SUPERVISOR'
                                ? 'bg-sph-blue/10 text-sph-blue'
                                : item.role === 'STAFF'
                                  ? 'bg-sph-green/10 text-sph-green'
                                  : item.role === 'MEMBER'
                                    ? 'bg-sph-amber/10 text-sph-amber'
                                    : 'bg-[var(--surface-elevated)] text-muted'
                            }`}
                          >
                            {item.role === 'DEPARTMENT_SUPERVISOR' ? 'Supervisor' : item.role}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-medium uppercase ${
                              item.type === 'attendance'
                                ? 'text-sph-amber'
                                : item.type === 'dispute'
                                  ? 'text-sph-red'
                                  : 'text-sph-blue'
                            }`}
                          >
                            {item.type === 'attendance'
                              ? 'Attendance'
                              : item.type === 'dispute'
                                ? 'Dispute'
                                : 'Leave'}
                          </span>
                          {item.reason && (
                            <span className="text-xs text-muted line-clamp-1">— {item.reason}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <UserCheck className="h-6 w-6 text-sph-green" />
                    <p className="text-sm text-muted">No items need your review</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Escalated */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-sph-red" /> Escalated
                </CardTitle>
              </CardHeader>
              <CardContent>
                {escalatedItems && escalatedItems.length > 0 ? (
                  <div className="space-y-3">
                    {escalatedItems.slice(0, 10).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-sph-red/20 bg-sph-red/5 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {item.fullName}
                          </p>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              item.role === 'DEPARTMENT_SUPERVISOR'
                                ? 'bg-sph-blue/10 text-sph-blue'
                                : item.role === 'STAFF'
                                  ? 'bg-sph-green/10 text-sph-green'
                                  : item.role === 'MEMBER'
                                    ? 'bg-sph-amber/10 text-sph-amber'
                                    : 'bg-[var(--surface-elevated)] text-muted'
                            }`}
                          >
                            {item.role === 'DEPARTMENT_SUPERVISOR' ? 'Supervisor' : item.role}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-medium uppercase ${
                              item.type === 'dispute' ? 'text-sph-red' : 'text-sph-blue'
                            }`}
                          >
                            {item.type === 'dispute' ? 'Dispute' : 'Leave'}
                          </span>
                          {item.reason && (
                            <span className="text-xs text-muted line-clamp-1">— {item.reason}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <CheckCircle className="h-6 w-6 text-sph-green" />
                    <p className="text-sm text-muted">All clear — nothing escalated</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Calm empty state when both sections are empty */}
        {!isLoading &&
          (!reviewItems || reviewItems.length === 0) &&
          (!escalatedItems || escalatedItems.length === 0) && (
            <div className="flex flex-col items-center gap-3 rounded-2xl surface py-10 text-center">
              <CheckCircle className="h-10 w-10 text-sph-green" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                All clear — nothing needs your attention today
              </p>
            </div>
          )}

        {/* Announcements */}
        {!isLoading && (
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
              <Link
                href="/dashboard/announcements"
                className="text-xs text-sph-blue hover:underline"
              >
                View all →
              </Link>
            </div>
            <AnnouncementCard announcements={announcements?.announcements.slice(0, 3) ?? []} />
          </div>
        )}

        {/* Loading state for admin */}
        {isLoading && (
          <div className="space-y-4">
            <CardSkeleton />
            <div className="grid gap-4 lg:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DEPARTMENT SUPERVISOR DASHBOARD ──
  if (isSupervisor) {
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
                  Habari, {firstName}
                </h1>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${data ? 'bg-sph-green' : 'bg-sph-amber'}`}
                />
              </div>
              {greetingSubtitle && <p className="text-sm text-secondary">{greetingSubtitle}</p>}
              {shiftInfo && <p className="mt-0.5 text-xs text-muted">{shiftInfo}</p>}
            </>
          )}
        </div>

        {/* Quick Dept Stats */}
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 border-sph-amber/30 text-sph-amber"
            >
              <Clock className="h-3 w-3" /> {deptData?.late ?? 0} late today
            </Badge>
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 border-sph-red/30 text-sph-red"
            >
              <AlertTriangle className="h-3 w-3" /> {deptData?.unresolved ?? 0} unresolved
            </Badge>
            {disputes && disputes.disputes.length > 0 && (
              <Badge
                variant="outline"
                className="flex items-center gap-1.5 border-sph-blue/30 text-sph-blue"
              >
                <MessageSquare className="h-3 w-3" /> {disputes.disputes.length} disputes
              </Badge>
            )}
            <Link
              href="/dashboard/supervisor"
              className="ml-auto inline-flex items-center gap-1 text-xs text-sph-blue hover:underline"
            >
              Supervisor Dashboard <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* Check-In */}
        <Card>
          <CardContent className="py-6">
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
                role={role}
                departmentName={deptName}
              />
            )}
          </CardContent>
        </Card>

        {/* Recent Attendance */}
        {!isLoading && data?.recentHistory && <RecentAttendanceTable logs={data.recentHistory} />}

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4">
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

        {/* Announcements */}
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

  // ── ATTACHEE DASHBOARD (Redesigned) ──

  const userStatus = data?.user?.status;

  if (isAttachee && userStatus === 'ACTIVE') {
    const heroPhase: HeroPhase =
      phase === 'checked-out' ? 'checked-out' : phase === 'checked-in' ? 'checked-in' : 'idle';
    return (
      <div className="flex flex-col gap-6">
        {/* Greeting */}
        <div>
          {isLoading ? (
            <GreetingSkeleton />
          ) : (
            <>
              <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                {firstName ? `Habari, ${firstName}` : 'Habari'}
              </h1>
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
          />
        )}

        {/* Needs Attention */}
        {!isLoading && missingDays.length > 0 && (
          <NeedsAttention missingDays={missingDays.map((d) => ({ date: d }))} />
        )}

        {/* Today's Progress */}
        {!isLoading && (
          <TodayProgress
            checkInTime={checkInTime}
            checkOutTime={checkOutTime}
            hasWorkLog={hasWorkLog}
            phase={phase}
          />
        )}

        {/* Portfolio Metrics */}
        {!isLoading && (
          <PortfolioMetrics
            attendanceScore={data?.attendanceScore ?? 0}
            streak={data?.streak ?? 0}
            attendanceBreakdown={data?.attendanceBreakdown}
            logbookCount={logbookCount}
          />
        )}

        {/* Recent Attendance */}
        {!isLoading && data?.recentHistory && <RecentAttendanceTable logs={data.recentHistory} />}

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

  // ── STAFF / MEMBER / ATTACHEE DASHBOARD ──

  // STATE P: Pending approval or rejected
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
            <Clock className="h-8 w-8 text-sph-amber" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Account Pending Approval
          </h2>
          <p className="max-w-sm text-sm text-secondary">
            Your registration is awaiting review by a supervisor. You will be notified once your
            account is activated.
          </p>
        </div>

        {/* Announcements */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
            <Link href="/dashboard/announcements" className="text-xs text-sph-blue hover:underline">
              View all →
            </Link>
          </div>
          <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
        </div>
      </div>
    );
  }

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

        {/* Announcements */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Announcements</h2>
            <Link href="/dashboard/announcements" className="text-xs text-sph-blue hover:underline">
              View all →
            </Link>
          </div>
          <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
        </div>
      </div>
    );
  }

  // STATE C: After check-out
  if (phase === 'checked-out') {
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

        {/* Today Summary */}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            {isLoading ? (
              <CheckInButtonSkeleton />
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sph-green/20">
                  <div className="h-3 w-3 rounded-full bg-sph-green" />
                </div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">Day Complete</h2>
                <p className="text-sm text-secondary">
                  {formatTime(checkInTime)} — {formatTime(checkOutTime)}
                </p>
                <div className="flex items-center gap-2">
                  <Badge className={statusBadgeClass(checkInStatus)}>{checkInStatus}</Badge>
                </div>
                <Link
                  href="/dashboard/worklog"
                  className="rounded-xl bg-sph-blue px-6 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5"
                >
                  View Work Log
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        {/* Score Ring - only visible after check-out */}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            {isLoading ? (
              <Skeleton className="h-32 rounded-lg bg-[var(--surface-elevated)]" />
            ) : (
              <>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your Score</h2>
                <ScoreRing score={data?.attendanceScore ?? 0} size={140} />
                <p className="text-lg font-bold text-[var(--text-primary)]">
                  {data?.attendanceScore ?? 0}% Attendance
                </p>
                <p className="text-sm text-muted">{data?.streak ?? 0}-day streak!</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Attendance */}
        {!isLoading && data?.recentHistory && <RecentAttendanceTable logs={data.recentHistory} />}

        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardAction>
              <Link
                href="/dashboard/announcements"
                className="text-xs text-sph-blue hover:underline"
              >
                View all →
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl bg-[var(--surface-elevated)]" />
                ))}
              </div>
            ) : (
              <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // STATE B: After check-in, not checked out
  if (phase === 'checked-in') {
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

        {/* Today Card */}
        <Card>
          <CardContent className="py-6">
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
                role={role}
                departmentName={deptName}
              />
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link
              href="/dashboard/worklog"
              className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4 transition-colors hover:bg-[var(--surface-elevated)]"
            >
              <span className="text-sm text-[var(--text-primary)]">Submit Work Log</span>
              <ArrowRight className="h-4 w-4 text-muted" />
            </Link>
            <Link
              href="/dashboard/history"
              className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4 transition-colors hover:bg-[var(--surface-elevated)]"
            >
              <span className="text-sm text-[var(--text-primary)]">View History</span>
              <ArrowRight className="h-4 w-4 text-muted" />
            </Link>
            <Link
              href="/dashboard/disputes"
              className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4 transition-colors hover:bg-[var(--surface-elevated)]"
            >
              <span className="text-sm text-[var(--text-primary)]">File Dispute</span>
              <ArrowRight className="h-4 w-4 text-muted" />
            </Link>
          </CardContent>
        </Card>

        {/* Recent Attendance */}
        {!isLoading && data?.recentHistory && <RecentAttendanceTable logs={data.recentHistory} />}

        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardAction>
              <Link
                href="/dashboard/announcements"
                className="text-xs text-sph-blue hover:underline"
              >
                View all →
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl bg-[var(--surface-elevated)]" />
                ))}
              </div>
            ) : (
              <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // STATE A: Before check-in
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

      {/* Check-In Hero */}
      <Card>
        <CardContent className="py-8">
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
              role={role}
              departmentName={deptName}
            />
          )}
        </CardContent>
      </Card>

      {/* Recent Attendance */}
      {!isLoading && data?.recentHistory && <RecentAttendanceTable logs={data.recentHistory} />}

      {/* Announcements */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-[var(--surface-elevated)]" />
          ))}
        </div>
      ) : (
        announcements &&
        announcements.announcements.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardAction>
                <Link
                  href="/dashboard/announcements"
                  className="text-xs text-sph-blue hover:underline"
                >
                  View all →
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <AnnouncementCard announcements={announcements.announcements.slice(0, 2)} />
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
