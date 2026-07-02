'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Users,
  Building2,
  Search,
  ChevronDown,
  X,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  Filter,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface CohortInfo {
  id: string;
  name: string;
}

interface SupervisorInfo {
  id: string;
  fullName: string;
}

interface DepartmentInfo {
  id: string;
  name: string;
  supervisor: SupervisorInfo | null;
}

interface LogUser {
  id: string;
  fullName: string;
  role: string;
  cohort: CohortInfo | null;
}

interface AttendanceLogEntry {
  id: string;
  userId: string;
  departmentId: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  checkOutMethod: string | null;
  checkInMethod: string | null;
  status: string;
  overriddenBy: string | null;
  user: LogUser;
  department: DepartmentInfo;
}

interface LogsResponse {
  logs: AttendanceLogEntry[];
}

type TimeRange = 'today' | 'week' | 'month' | 'custom';

const STATUS_STYLES: Record<string, string> = {
  EARLY: 'text-sph-green bg-sph-green/10',
  ON_TIME: 'text-sph-green bg-sph-green/10',
  LATE: 'text-sph-amber bg-sph-amber/10',
  UNRESOLVED: 'text-sph-red bg-sph-red/10',
  ABSENT_EXCUSED: 'text-sph-blue bg-sph-blue/10',
  ABSENT_UNEXCUSED: 'text-sph-red bg-sph-red/10',
  ABSENT_EXCUSE_PENDING: 'text-sph-blue bg-sph-blue/10',
  LEFT_EARLY: 'text-sph-amber bg-sph-amber/10',
  DISPUTED: 'text-sph-red bg-sph-red/10',
};

const STATUS_LABELS: Record<string, string> = {
  EARLY: 'Early',
  ON_TIME: 'On Time',
  LATE: 'Late',
  UNRESOLVED: 'Unresolved',
  ABSENT_EXCUSED: 'Excused',
  ABSENT_UNEXCUSED: 'Absent',
  ABSENT_EXCUSE_PENDING: 'Excuse Pending',
  LEFT_EARLY: 'Left Early',
  DISPUTED: 'Disputed',
};

const CHECKOUT_LABELS: Record<string, string> = {
  SCANNED: 'Scanned',
  USER_REPORTED: 'Self Report',
  AUTO_CLOSED: 'Auto Close',
  SIMPLE: 'Manual',
};

export default function OverviewPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const [data, setData] = useState<AttendanceLogEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');

  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedDept, setAppliedDept] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const getRangeDates = useCallback(() => {
    const now = new Date();
    switch (timeRange) {
      case 'today':
        return { start: now, end: now };
      case 'week': {
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay() + 1);
        return { start, end: now };
      }
      case 'month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start, end: now };
      }
      case 'custom':
      default:
        return { start: now, end: now };
    }
  }, [timeRange]);

  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { start, end } = getRangeDates();
        const params = new URLSearchParams({
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd'),
        });
        if (appliedDept) params.set('departmentId', appliedDept);
        if (appliedStatus) params.set('status', appliedStatus);
        if (appliedSearch) params.set('search', appliedSearch);

        const res = await get<LogsResponse>(`/dashboard/admin/logs?${params}`);
        setData(res.logs);
      } catch {
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user, timeRange, appliedDept, appliedStatus, appliedSearch, getRangeDates]);

  const handleFilter = () => {
    setAppliedDept(deptFilter);
    setAppliedStatus(statusFilter);
    setAppliedSearch(searchQuery);
  };

  const clearFilters = () => {
    setDeptFilter('');
    setStatusFilter('');
    setSearchQuery('');
    setAppliedDept('');
    setAppliedStatus('');
    setAppliedSearch('');
  };

  const departmentSummaries = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      {
        name: string;
        supervisor: SupervisorInfo | null;
        users: Set<string>;
        byStatus: Record<string, number>;
      }
    >();
    for (const log of data) {
      const deptId = log.department.id;
      const deptName = log.department.name;
      const sup = log.department.supervisor;
      if (!map.has(deptId)) {
        map.set(deptId, { name: deptName, supervisor: sup, users: new Set(), byStatus: {} });
      }
      const entry = map.get(deptId)!;
      entry.users.add(log.userId);
      entry.byStatus[log.status] = (entry.byStatus[log.status] || 0) + 1;
    }
    return Array.from(map.entries()).map(([id, val]) => ({
      id,
      name: val.name,
      supervisor: val.supervisor,
      userCount: val.users.size,
      byStatus: val.byStatus,
      total: data.filter((l) => l.department.id === id).length,
    }));
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    let result = data;
    if (appliedDept) result = result.filter((l) => l.department.id === appliedDept);
    if (appliedStatus) result = result.filter((l) => l.status === appliedStatus);
    if (appliedSearch) {
      const q = appliedSearch.toLowerCase();
      result = result.filter((l) => l.user.fullName.toLowerCase().includes(q));
    }
    return result;
  }, [data, appliedDept, appliedStatus, appliedSearch]);

  const uniqueDepartments = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const log of data) {
      map.set(log.department.id, log.department.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Attendance Overview</h1>
          <p className="mt-1 text-sm text-muted">
            View and filter attendance across all departments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['today', 'week', 'month'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTimeRange(opt)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === opt
                  ? 'bg-sph-green text-white'
                  : 'bg-[var(--surface-elevated)] text-secondary hover:bg-sph-green/10 hover:text-sph-green'
              }`}
            >
              {opt === 'today' ? 'Today' : opt === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Department Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="mb-2 h-4 w-24" />
                <Skeleton className="mb-3 h-3 w-32" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : data && departmentSummaries.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {departmentSummaries.map((dept) => {
            const good = (dept.byStatus['EARLY'] ?? 0) + (dept.byStatus['ON_TIME'] ?? 0);
            const late = dept.byStatus['LATE'] ?? 0;
            const unresolved = dept.byStatus['UNRESOLVED'] ?? 0;
            const absent =
              (dept.byStatus['ABSENT_UNEXCUSED'] ?? 0) + (dept.byStatus['ABSENT_EXCUSED'] ?? 0);
            const disputed = dept.byStatus['DISPUTED'] ?? 0;
            const rate = dept.total > 0 ? Math.round((good / dept.total) * 100) : 0;

            return (
              <Card key={dept.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {dept.name}
                      </p>
                      {dept.supervisor ? (
                        <p className="truncate text-xs text-muted">{dept.supervisor.fullName}</p>
                      ) : (
                        <p className="text-xs text-muted italic">No supervisor</p>
                      )}
                    </div>
                    <p className="ml-2 shrink-0 text-lg font-bold text-[var(--text-primary)]">
                      {dept.userCount}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        rate >= 80 ? 'bg-sph-green' : rate >= 50 ? 'bg-sph-amber' : 'bg-sph-red'
                      }`}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted">{rate}% on time</p>

                  {/* Status badges */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {good > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sph-green/30 text-[10px] text-sph-green"
                      >
                        <UserCheck className="h-3 w-3" /> {good}
                      </Badge>
                    )}
                    {late > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sph-amber/30 text-[10px] text-sph-amber"
                      >
                        <Clock className="h-3 w-3" /> {late}
                      </Badge>
                    )}
                    {unresolved > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sph-red/30 text-[10px] text-sph-red"
                      >
                        <AlertTriangle className="h-3 w-3" /> {unresolved}
                      </Badge>
                    )}
                    {absent > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sph-blue/30 text-[10px] text-sph-blue"
                      >
                        <UserX className="h-3 w-3" /> {absent}
                      </Badge>
                    )}
                    {disputed > 0 && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-sph-red/30 text-[10px] text-sph-red"
                      >
                        <AlertTriangle className="h-3 w-3" /> {disputed}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <CheckCircle className="h-10 w-10 text-sph-green" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              No attendance records found
            </p>
            <p className="text-xs text-muted">Try a different time range or check back later.</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFilter();
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-muted focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
          />
        </div>

        <div className="relative">
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
          >
            <option value="">All Departments</option>
            {uniqueDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>

        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2 pl-3 pr-8 text-sm text-[var(--text-primary)] focus:border-sph-green focus:outline-none focus:ring-1 focus:ring-sph-green/30"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        </div>

        <button
          type="button"
          onClick={handleFilter}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sph-green px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sph-green/90"
        >
          <Filter className="h-3.5 w-3.5" /> Apply
        </button>

        {(appliedDept || appliedStatus || appliedSearch) && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-secondary transition-colors hover:bg-[var(--surface-elevated)]"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Drill-down Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium text-muted">
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                {filteredData.length} record{filteredData.length !== 1 ? 's' : ''}
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : filteredData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Cohort</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Check In</th>
                    <th className="px-4 py-3 font-medium">Check Out</th>
                    <th className="px-4 py-3 font-medium">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--text-primary)]">
                        {log.user.fullName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {log.department.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {log.user.cohort?.name ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {format(new Date(log.date), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`gap-1 text-[10px] ${STATUS_STYLES[log.status] ?? 'text-muted'}`}
                        >
                          {STATUS_LABELS[log.status] ?? log.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {log.checkInTime ? format(new Date(log.checkInTime), 'h:mm a') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {log.checkOutTime ? format(new Date(log.checkOutTime), 'h:mm a') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {log.checkOutMethod
                          ? (CHECKOUT_LABELS[log.checkOutMethod] ?? log.checkOutMethod)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-10">
              <Search className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted">No records match your filters</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-sph-blue hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
