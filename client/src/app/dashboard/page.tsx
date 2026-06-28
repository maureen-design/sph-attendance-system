'use client';

import { useEffect, useCallback, useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  user: { fullName: string; role: string; department: { id: string; name: string } | null };
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

// ── Helpers ──

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function buildWeekDays(logs: BackendAttendanceLog[]): WeekDay[] {
  const byDate = new Map(logs.map((l) => [l.date.split('T')[0], l]));
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
  const role = authUser?.role ?? '';

  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsData | null>(null);
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [deptData, setDeptData] = useState<SupervisorData | null>(null);
  const [disputes, setDisputes] = useState<DisputesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check-in state
  const [phase, setPhase] = useState<CheckInPhase>('idle');
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  const isAdmin = role === 'SUPER_ADMIN';
  const isSupervisor = role === 'DEPARTMENT_SUPERVISOR';
  const isRegular = !isAdmin && !isSupervisor;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        // SUPER_ADMIN: org-wide stats + disputes
        const [live, annData, disp] = await Promise.all([
          get<LiveData>('/dashboard/supervisor/live'),
          get<AnnouncementsData>('/announcements').catch(() => null),
          get<DisputesData>('/disputes?status=OPEN'),
        ]);
        setLiveData(live);
        setAnnouncements(annData);
        setDisputes(disp);
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, isSupervisor]);

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

  const subtitle = data?.user?.department?.name ?? '';
  const weekDays = data?.thisWeek ? buildWeekDays(data.thisWeek) : [];

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
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                    Habari, {firstName}
                  </h1>
                  <Badge variant="outline" className="text-[10px]">
                    SUPER_ADMIN
                  </Badge>
                </div>
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

        {/* Admin CTA */}
        {!isLoading && (
          <Link
            href="/dashboard/admin"
            className="flex items-center justify-between rounded-2xl surface p-5 transition-colors hover:bg-[var(--surface-elevated)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sph-green/10">
                <Shield className="h-5 w-5 text-sph-green" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Admin Dashboard</p>
                <p className="text-xs text-muted">
                  Full org management, users, departments, and settings
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted" />
          </Link>
        )}

        {/* Pending Reviews + Department Breakdown */}
        {!isLoading && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Pending Reviews */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" /> Pending Reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                {disputes && disputes.disputes.length > 0 ? (
                  <div className="space-y-3">
                    {disputes.disputes.slice(0, 3).map((d) => (
                      <div key={d.id} className="rounded-lg border border-[var(--border)] p-3">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {d.user.fullName}
                        </p>
                        <p className="mt-1 text-xs text-muted line-clamp-2">{d.reason}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <UserCheck className="h-6 w-6 text-sph-green" />
                    <p className="text-sm text-muted">No pending reviews</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Department Snapshot */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Departments Today
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {liveData && liveData.departments.length > 0 ? (
                  <div className="divide-y divide-[var(--border)]">
                    {liveData.departments.slice(0, 5).map((dept) => (
                      <div key={dept.id} className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-[var(--text-primary)]">{dept.name}</span>
                        <div className="flex items-center gap-3 text-xs text-muted">
                          <span className="text-sph-green">{dept.checkedIn} in</span>
                          {dept.late > 0 && (
                            <span className="text-sph-amber">{dept.late} late</span>
                          )}
                          {dept.unresolved > 0 && (
                            <span className="text-sph-red">{dept.unresolved} ?</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted">No department data.</p>
                )}
              </CardContent>
            </Card>
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
              {subtitle && <p className="text-sm text-secondary">{subtitle}</p>}
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
              role={role}
              departmentName={subtitle}
              departmentShiftEnd={undefined}
              checkInTimeIso={checkInTime}
            />
          )}
        </div>

        {/* Week Strip */}
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

  // ── STAFF / MEMBER / ATTACHEE DASHBOARD (3-state redesign) ──

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
              {subtitle && <p className="text-sm text-secondary">{subtitle}</p>}
            </>
          )}
        </div>

        {/* Today Summary */}
        <div className="rounded-2xl surface p-6">
          {isLoading ? (
            <CheckInButtonSkeleton />
          ) : (
            <div className="flex flex-col items-center gap-4">
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
            </div>
          )}
        </div>

        {/* Score Ring - only visible after check-out */}
        <div className="rounded-2xl surface p-6">
          {isLoading ? (
            <Skeleton className="h-32 rounded-lg bg-[var(--surface-elevated)]" />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Your Score</h2>
              <ScoreRing score={data?.attendanceScore ?? 0} size={140} />
              <p className="text-lg font-bold text-[var(--text-primary)]">
                {data?.attendanceScore ?? 0}% Attendance
              </p>
              <p className="text-sm text-muted">{data?.streak ?? 0}-day streak!</p>
            </div>
          )}
        </div>

        {/* Week Strip */}
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
            <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
          )}
        </div>
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
            </>
          )}
        </div>

        {/* Today Card */}
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
              role={role}
              departmentName={subtitle}
              departmentShiftEnd={undefined}
              checkInTimeIso={checkInTime}
            />
          )}
        </div>

        {/* Week Strip */}
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

        {/* Quick Actions */}
        <div className="rounded-2xl surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Quick Actions</h2>
          <div className="flex flex-col gap-3">
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
          </div>
        </div>

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
            <AnnouncementCard announcements={announcements?.announcements.slice(0, 2) ?? []} />
          )}
        </div>
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
            {subtitle && <p className="text-sm text-secondary">{subtitle}</p>}
          </>
        )}
      </div>

      {/* Check-In Hero */}
      <div className="rounded-2xl surface p-8">
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
            departmentName={subtitle}
            departmentShiftEnd={undefined}
            checkInTimeIso={checkInTime}
          />
        )}
      </div>

      {/* Collapsed Week Strip */}
      <div className="flex items-center justify-between rounded-2xl surface px-5 py-4">
        <span className="text-sm text-secondary">
          This week: {weekDays.filter((d) => d.status).length}/5 days
        </span>
        <Link href="/dashboard/history" className="text-xs text-sph-blue hover:underline">
          Tap to see →
        </Link>
      </div>

      {/* Announcements - single line preview */}
      {announcements && announcements.announcements.length > 0 && (
        <div className="rounded-2xl surface px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-sph-blue" />
            <div className="flex-1">
              <p className="text-sm text-[var(--text-primary)]">
                {announcements.announcements[0].title}
              </p>
              <Link
                href="/dashboard/announcements"
                className="mt-1 text-xs text-sph-blue hover:underline"
              >
                View all announcements →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
