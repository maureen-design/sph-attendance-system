'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Clock,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  Filter,
  MoreHorizontal,
  CheckCircle,
  MessageSquare,
  UserCheck,
  UserX,
  UserPlus,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Download,
  Calendar,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get, patch, post } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AttendanceStatus =
  | 'ON_TIME'
  | 'LATE'
  | 'EARLY'
  | 'LEFT_EARLY'
  | 'UNRESOLVED'
  | 'ABSENT_UNEXCUSED'
  | 'ABSENT_EXCUSED'
  | 'ABSENT_EXCUSE_PENDING'
  | 'DISPUTED';

interface UserInfo {
  id: string;
  fullName: string;
  role: string;
}

interface AttendanceLog {
  id: string;
  userId: string;
  departmentId: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkOutMethod: string | null;
  checkInMethod: string | null;
  status: AttendanceStatus;
  overriddenBy: string | null;
}

interface AttendanceRecord {
  user: UserInfo;
  log: AttendanceLog | null;
  status: AttendanceStatus;
}

interface SupervisorData {
  totalExpected: number;
  checkedIn: number;
  late: number;
  absent: number;
  unresolved: number;
  records: AttendanceRecord[];
  cohorts?: { id: string; name: string }[];
}

interface LiveDept {
  id: string;
  name: string;
  totalUsers: number;
  checkedIn: number;
  late: number;
  notCheckedIn: number;
}

interface LiveData {
  departments: LiveDept[];
  lastUpdated: string;
}

interface Dispute {
  id: string;
  attendanceLogId: string;
  userId: string;
  reason: string;
  resolvedBy: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  user: { id: string; fullName: string };
  attendanceLog: { id: string; date: string; status: string };
}

interface DisputesData {
  disputes: Dispute[];
}

interface PendingUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  department: { id: string; name: string } | null;
  cohort: { id: string; name: string } | null;
}

interface PendingApprovalsData {
  users: PendingUser[];
}

interface PendingLeave {
  id: string;
  userId: string;
  type: 'SICK' | 'EMERGENCY' | 'OFFICIAL_DUTY' | 'OTHER';
  startDate: string;
  endDate: string;
  reason: string;
  createdAt: string;
  user: { id: string; fullName: string; role: string };
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  SICK: 'Sick Leave',
  EMERGENCY: 'Emergency',
  OFFICIAL_DUTY: 'Official Duty',
  OTHER: 'Other',
};

const STATUS_COLORS: Record<string, string> = {
  ON_TIME: 'bg-sph-green/10 text-sph-green border-sph-green/20',
  EARLY: 'bg-sph-green/10 text-sph-green border-sph-green/20',
  LATE: 'bg-sph-amber/10 text-sph-amber border-sph-amber/20',
  LEFT_EARLY: 'bg-sph-amber/10 text-sph-amber border-sph-amber/20',
  UNRESOLVED: 'bg-[var(--surface-elevated)] text-muted border-[var(--border)]',
  ABSENT_UNEXCUSED: 'bg-sph-red/10 text-sph-red border-sph-red/20',
  ABSENT_EXCUSED: 'bg-sph-blue/10 text-sph-blue border-sph-blue/20',
  ABSENT_EXCUSE_PENDING: 'bg-sph-amber/10 text-sph-amber border-sph-amber/20',
  DISPUTED: 'bg-sph-red/10 text-sph-red border-sph-red/20',
};

function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS.UNRESOLVED}`}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function SupervisorDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [supervisorData, setSupervisorData] = useState<SupervisorData | null>(null);
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [disputesData, setDisputesData] = useState<DisputesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pending approvals
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalsData | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Leave requests
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [decidingLeaveId, setDecidingLeaveId] = useState<string | null>(null);
  const [leaveDecisionNote, setLeaveDecisionNote] = useState('');
  const [decisionTarget, setDecisionTarget] = useState<PendingLeave | null>(null);
  const [decisionAction, setDecisionAction] = useState<'APPROVED' | 'REJECTED' | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<PendingUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterCohort, setFilterCohort] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // Export
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (user && !['SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'].includes(user.role)) {
      router.replace('/dashboard');
      return;
    }
  }, [user, router]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (filterStatus) params.set('status', filterStatus);
        if (filterSearch) params.set('search', filterSearch);
        if (filterCohort) params.set('cohortId', filterCohort);

        const [roster, live, disputes, pending, leaves] = await Promise.all([
          get<SupervisorData>(`/dashboard/supervisor?${params}`),
          get<LiveData>('/dashboard/supervisor/live'),
          get<DisputesData>('/disputes?status=OPEN'),
          get<PendingApprovalsData>('/approvals/pending').catch(() => null),
          get<{ leaves: PendingLeave[] }>('/leaves/pending').catch(() => null),
        ]);
        setSupervisorData(roster);
        setLiveData(live);
        setDisputesData(disputes);
        if (pending) setPendingApprovals(pending);
        if (leaves) setPendingLeaves(leaves.leaves);
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [filterStatus, filterSearch, filterCohort]);

  const handleSearch = useCallback(() => {
    setFilterSearch(searchInput);
    setCurrentPage(1);
  }, [searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setFilterSearch('');
    setCurrentPage(1);
  }, []);

  const handleApprove = useCallback(async (targetId: string) => {
    setApprovingId(targetId);
    try {
      await post(`/approvals/${targetId}/approve`);
      setPendingApprovals((prev) =>
        prev ? { users: prev.users.filter((u) => u.id !== targetId) } : prev,
      );
    } catch {
      // Error handled silently
    } finally {
      setApprovingId(null);
    }
  }, []);

  const handleReject = useCallback(async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await post(`/approvals/${rejectTarget.id}/reject`, { reason: rejectReason || undefined });
      setPendingApprovals((prev) =>
        prev ? { users: prev.users.filter((u) => u.id !== rejectTarget.id) } : prev,
      );
      setRejectTarget(null);
      setRejectReason('');
    } catch {
      // Error handled silently
    } finally {
      setRejecting(false);
    }
  }, [rejectTarget, rejectReason]);

  // Leave decision
  const handleApproveLeave = useCallback(async (leaveId: string) => {
    setDecidingLeaveId(leaveId);
    try {
      await patch(`/leaves/${leaveId}/decide`, { action: 'APPROVED' });
      setPendingLeaves((prev) => prev.filter((l) => l.id !== leaveId));
    } catch {
      // Error handled silently
    } finally {
      setDecidingLeaveId(null);
    }
  }, []);

  const handleRejectLeave = useCallback(async () => {
    if (!decisionTarget) return;
    setDecidingLeaveId(decisionTarget.id);
    try {
      await patch(`/leaves/${decisionTarget.id}/decide`, {
        action: 'REJECTED',
        decisionNote: leaveDecisionNote || undefined,
      });
      setPendingLeaves((prev) => prev.filter((l) => l.id !== decisionTarget.id));
      setDecisionTarget(null);
      setDecisionAction(null);
      setLeaveDecisionNote('');
    } catch {
      // Error handled silently
    } finally {
      setDecidingLeaveId(null);
    }
  }, [decisionTarget, leaveDecisionNote]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      let start: string;
      let end: string;
      const today = new Date();
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      if (exportRange === 'today') {
        start = end = fmt(today);
      } else if (exportRange === 'week') {
        const day = today.getDay();
        const mon = new Date(today);
        mon.setDate(today.getDate() - ((day + 6) % 7));
        start = fmt(mon);
        end = fmt(today);
      } else if (exportRange === 'month') {
        start = fmt(new Date(today.getFullYear(), today.getMonth(), 1));
        end = fmt(today);
      } else {
        start = exportStartDate;
        end = exportEndDate;
      }

      const params = new URLSearchParams({ startDate: start, endDate: end });
      const token = localStorage.getItem('accessToken');
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'}/dashboard/supervisor/export?${params}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${start}-${end}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [exportRange, exportStartDate, exportEndDate]);

  const dept = liveData?.departments[0];
  const totalExpected = supervisorData?.totalExpected ?? dept?.totalUsers ?? 0;
  const checkedIn = supervisorData?.checkedIn ?? dept?.checkedIn ?? 0;
  const late = supervisorData?.late ?? dept?.late ?? 0;
  const absent = (supervisorData?.absent ?? 0) + (supervisorData?.unresolved ?? 0);

  // Pagination
  const records = supervisorData?.records ?? [];
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const paginatedRecords = records.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!user || !['SUPER_ADMIN', 'DEPARTMENT_SUPERVISOR'].includes(user.role)) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Supervisor Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Today&apos;s attendance overview</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export
        </Button>
      </div>

      {/* Overview Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-0">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="pt-2">
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Total Expected
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{totalExpected}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Checked In
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="text-2xl font-bold text-sph-green">{checkedIn}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Late
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p
                className={`text-2xl font-bold ${late > 0 ? 'text-sph-amber' : 'text-[var(--text-primary)]'}`}
              >
                {late}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-sm text-muted flex items-center gap-1.5">
                <UserX className="h-3.5 w-3.5" />
                Absent / Unresolved
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <p
                className={`text-2xl font-bold ${absent > 0 ? 'text-sph-red' : 'text-[var(--text-primary)]'}`}
              >
                {absent}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live by Department */}
      {liveData && liveData.departments.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {liveData.departments.map((dept) => (
            <Card key={dept.id} className="border-sph-green/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sph-green animate-pulse" />
                  {dept.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Checked in</span>
                  <span className="font-semibold text-sph-green">{dept.checkedIn}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>Late</span>
                  <span className="font-semibold text-sph-amber">{dept.late}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>Not checked in</span>
                  <span className="font-semibold text-sph-red">{dept.notCheckedIn}</span>
                </div>
                <div className="mt-2 border-t border-[var(--border)] pt-2 flex items-center justify-between text-xs text-muted">
                  <span>Total</span>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {dept.totalUsers}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card className="border-[var(--border)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted" />
                Live indicator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted">
                Last updated:{' '}
                {new Date(liveData.lastUpdated).toLocaleTimeString('en-KE', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })}
              </p>
              <p className="mt-1 text-[10px] text-muted">Auto-refreshes every 30s</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="border-sph-red/30 bg-sph-red/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-sph-red" />
            <p className="text-sm text-sph-red">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name..."
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-9 pr-8 text-sm text-[var(--text-primary)] placeholder:text-muted focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30 transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(1);
          }}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30 transition-colors"
        >
          <option value="">All Statuses</option>
          <option value="ON_TIME">On Time</option>
          <option value="EARLY">Early</option>
          <option value="LATE">Late</option>
          <option value="LEFT_EARLY">Left Early</option>
          <option value="UNRESOLVED">Unresolved</option>
          <option value="ABSENT_UNEXCUSED">Absent</option>
        </select>

        <select
          value={filterCohort}
          onChange={(e) => {
            setFilterCohort(e.target.value);
            setCurrentPage(1);
          }}
          className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30 transition-colors"
        >
          <option value="">All Cohorts</option>
          {supervisorData?.cohorts?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Attendance Table */}
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Attendance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : paginatedRecords.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-muted">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Check-in</th>
                      <th className="px-4 py-3 font-medium">Check-out</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((record) => (
                      <tr
                        key={record.user.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-[var(--text-primary)]">
                            {record.user.fullName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted">{record.user.role}</span>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatTime(record.log?.checkInTime ?? null)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatTime(record.log?.checkOutTime ?? null)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={record.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12">
                <Users className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">No records found for selected filters.</p>
              </div>
            )}

            {/* Pagination */}
            {records.length > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
                <p className="text-xs text-muted">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                  {Math.min(currentPage * PAGE_SIZE, records.length)} of {records.length}
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-muted transition-colors hover:bg-[var(--surface-elevated)] disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4 rotate-90" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-muted transition-colors hover:bg-[var(--surface-elevated)] disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4 -rotate-90" />
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: Pending Approvals & Reviews */}
        <div className="space-y-4">
          {/* Pending Approvals */}
          {pendingApprovals && pendingApprovals.users.length > 0 && (
            <Card className="border-sph-amber/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-sph-amber" />
                  Pending Approvals
                  <span className="ml-auto rounded-full bg-sph-amber/20 px-2 py-0.5 text-[10px] font-bold text-sph-amber">
                    {pendingApprovals.users.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingApprovals.users.map((pu) => (
                  <div
                    key={pu.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {pu.fullName}
                        </p>
                        <p className="truncate text-xs text-muted">{pu.email}</p>
                        {pu.department && (
                          <p className="mt-0.5 text-[10px] text-sph-amber">{pu.department.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1 h-8 text-xs"
                        disabled={approvingId === pu.id}
                        onClick={() => handleApprove(pu.id)}
                      >
                        {approvingId === pu.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <ThumbsUp className="h-3 w-3" />
                        )}
                        <span className="ml-1">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-8 text-xs border-sph-red/30 text-sph-red hover:bg-sph-red/10"
                        onClick={() => setRejectTarget(pu)}
                      >
                        <ThumbsDown className="h-3 w-3" />
                        <span className="ml-1">Reject</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Disputes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Disputes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {disputesData && disputesData.disputes.length > 0 ? (
                <div className="space-y-3">
                  {disputesData.disputes.slice(0, 5).map((dispute) => (
                    <div key={dispute.id} className="rounded-lg border border-[var(--border)] p-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {dispute.user.fullName}
                      </p>
                      <p className="mt-1 text-xs text-muted line-clamp-2">{dispute.reason}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        {new Date(dispute.createdAt).toLocaleDateString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6">
                  <CheckCircle className="h-6 w-6 text-sph-green" />
                  <p className="text-sm text-muted">No open disputes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leave Requests */}
          <Card className={pendingLeaves.length > 0 ? 'border-sph-blue/30' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-sph-blue" />
                Leave Requests
                {pendingLeaves.length > 0 && (
                  <span className="ml-auto rounded-full bg-sph-blue/20 px-2 py-0.5 text-[10px] font-bold text-sph-blue">
                    {pendingLeaves.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingLeaves.length > 0 ? (
                <div className="space-y-3">
                  {pendingLeaves.slice(0, 10).map((leave) => (
                    <div
                      key={leave.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/50 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {leave.user.fullName}
                          </p>
                          <p className="text-[10px] text-sph-blue">
                            {LEAVE_TYPE_LABELS[leave.type]}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted">
                            {new Date(leave.startDate).toLocaleDateString('en-KE', {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            &mdash;{' '}
                            {new Date(leave.endDate).toLocaleDateString('en-KE', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                          <p className="mt-1 text-xs text-muted line-clamp-2">{leave.reason}</p>
                          {(() => {
                            const slaMs = 72 * 3600000;
                            const elapsedMs = Date.now() - new Date(leave.createdAt).getTime();
                            const remainingMs = slaMs - elapsedMs;
                            const remainingH = Math.floor(remainingMs / 3600000);
                            if (remainingMs <= 0) {
                              return (
                                <p className="mt-1 text-[10px] font-medium text-sph-red">
                                  Overdue — escalated
                                </p>
                              );
                            }
                            const urgent = remainingH < 6;
                            const soon = remainingH < 24;
                            return (
                              <p
                                className={`mt-1 text-[10px] font-medium ${
                                  urgent
                                    ? 'text-sph-red'
                                    : soon
                                      ? 'text-sph-amber'
                                      : 'text-sph-green'
                                }`}
                              >
                                {remainingH}h remaining before escalation
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="flex-1 h-8 text-xs"
                          disabled={decidingLeaveId === leave.id}
                          onClick={() => handleApproveLeave(leave.id)}
                        >
                          {decidingLeaveId === leave.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ThumbsUp className="h-3 w-3" />
                          )}
                          <span className="ml-1">Approve</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs border-sph-red/30 text-sph-red hover:bg-sph-red/10"
                          onClick={() => {
                            setDecisionTarget(leave);
                            setDecisionAction('REJECTED');
                            setLeaveDecisionNote('');
                          }}
                        >
                          <ThumbsDown className="h-3 w-3" />
                          <span className="ml-1">Reject</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6">
                  <CalendarDays className="h-6 w-6 text-muted" />
                  <p className="text-sm text-muted">No pending requests</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Quick Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setFilterStatus('LATE');
                  setCurrentPage(1);
                }}
              >
                <Clock className="h-3.5 w-3.5 mr-2 text-sph-amber" />
                View Late Members
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setFilterStatus('UNRESOLVED');
                  setCurrentPage(1);
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-2 text-sph-red" />
                View Unresolved
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setFilterStatus('');
                  setCurrentPage(1);
                }}
              >
                <Users className="h-3.5 w-3.5 mr-2" />
                Show All
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Export Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Attendance</DialogTitle>
            <DialogDescription>Choose a date range for the CSV export.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'This Week' },
                  { value: 'month', label: 'This Month' },
                  { value: 'custom', label: 'Custom Range' },
                ] as const
              ).map((opt) => (
                <Button
                  key={opt.value}
                  variant={exportRange === opt.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setExportRange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>

            {exportRange === 'custom' && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Label htmlFor="exportStart">Start date</Label>
                  <Input
                    id="exportStart"
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[var(--text-primary)]"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="exportEnd">End date</Label>
                  <Input
                    id="exportEnd"
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                    className="mt-1 h-10 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={
                exporting || (exportRange === 'custom' && (!exportStartDate || !exportEndDate))
              }
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              {exporting ? 'Exporting...' : 'Download CSV'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Registration</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Reject <strong>{rejectTarget.fullName}</strong>&apos;s registration request.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Label htmlFor="rejectReason">Reason (optional)</Label>
            <Input
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Incomplete documentation"
              className="h-11 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" disabled={rejecting} onClick={handleReject}>
              {rejecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              <span className="ml-1">Reject</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Reject Modal */}
      <Dialog
        open={!!decisionTarget && decisionAction === 'REJECTED'}
        onOpenChange={(open) => {
          if (!open) {
            setDecisionTarget(null);
            setDecisionAction(null);
            setLeaveDecisionNote('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              {decisionTarget && (
                <>
                  Reject <strong>{decisionTarget.user.fullName}</strong>&apos;s{' '}
                  {LEAVE_TYPE_LABELS[decisionTarget.type]} leave request.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <Label htmlFor="leaveRejectReason">Reason (required)</Label>
            <Input
              id="leaveRejectReason"
              value={leaveDecisionNote}
              onChange={(e) => setLeaveDecisionNote(e.target.value)}
              placeholder="e.g. Insufficient coverage during this period"
              className="h-11 rounded-xl border-[var(--border)] bg-[var(--surface-elevated)] px-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDecisionTarget(null);
                setDecisionAction(null);
                setLeaveDecisionNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={decidingLeaveId === decisionTarget?.id || !leaveDecisionNote.trim()}
              onClick={handleRejectLeave}
            >
              {decidingLeaveId === decisionTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              <span className="ml-1">Reject</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
