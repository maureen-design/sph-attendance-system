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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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

interface Record {
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
  records: Record[];
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

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

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

        const [roster, live, disputes] = await Promise.all([
          get<SupervisorData>(`/dashboard/supervisor?${params}`),
          get<LiveData>('/dashboard/supervisor/live'),
          get<DisputesData>('/disputes?status=OPEN'),
        ]);
        setSupervisorData(roster);
        setLiveData(live);
        setDisputesData(disputes);
      } catch {
        setError('Failed to load dashboard data.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [filterStatus, filterSearch]);

  const handleSearch = useCallback(() => {
    setFilterSearch(searchInput);
    setCurrentPage(1);
  }, [searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setFilterSearch('');
    setCurrentPage(1);
  }, []);

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
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Supervisor Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Today&apos;s attendance overview</p>
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

        {/* Sidebar: Pending Reviews */}
        <div className="space-y-4">
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
    </div>
  );
}
