'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Clock,
  Flag,
  X,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  FileText,
} from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { get, post } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { RecentAttendanceTable } from '@/components/dashboard/RecentAttendanceTable';
import { toast } from 'sonner';

type AttendanceStatus =
  | 'ON_TIME'
  | 'EARLY'
  | 'LATE'
  | 'LEFT_EARLY'
  | 'UNRESOLVED'
  | 'ABSENT_EXCUSED'
  | 'ABSENT_UNEXCUSED'
  | 'DISPUTED';

interface DayLog {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  hours: number | null;
  workLogId: string | null;
  dispute: {
    id: string;
    resolvedAt: string | null;
    resolution: string | null;
  } | null;
}

interface HistoryResponse {
  logs: DayLog[];
  statusCounts: Record<string, number>;
  weekendDays: number;
  holidayDays: number;
  month: { year: number; month: number };
}

interface TrendWeek {
  weekStart: string;
  score: number;
  present: number;
  total: number;
}

interface TrendResponse {
  weeks: TrendWeek[];
  currentScore: number;
  comparison: number;
}

const STATUS_DOT: Record<string, string> = {
  ON_TIME: 'bg-sph-green',
  EARLY: 'bg-sph-green',
  LATE: 'bg-sph-amber',
  LEFT_EARLY: 'bg-sph-amber',
  UNRESOLVED: 'bg-sph-red',
  ABSENT_EXCUSED: 'bg-sph-blue',
  ABSENT_UNEXCUSED: 'bg-sph-red',
  DISPUTED: 'bg-sph-amber',
};

const STATUS_LABEL: Record<string, string> = {
  ON_TIME: 'On-Time',
  EARLY: 'Early',
  LATE: 'Late',
  LEFT_EARLY: 'Left Early',
  UNRESOLVED: 'Unresolved',
  ABSENT_EXCUSED: 'Excused',
  ABSENT_UNEXCUSED: 'Absent',
  DISPUTED: 'Disputed',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HistoryPage() {
  const { user } = useAuth();
  const isAttachee = user?.role === 'ATTACHEE';

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const [selectedDay, setSelectedDay] = useState<DayLog | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [trendLoading, setTrendLoading] = useState(true);

  // Dispute form
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await get<HistoryResponse>(
        `/attendance/history?year=${viewYear}&month=${viewMonth}`,
      );
      setHistoryData(data);
    } catch {
      setHistoryData(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [viewYear, viewMonth]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const data = await get<TrendResponse>('/attendance/trend?weeks=12');
      setTrendData(data);
    } catch {
      setTrendData(null);
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  const monthStart = useMemo(() => new Date(viewYear, viewMonth - 1, 1), [viewYear, viewMonth]);
  const monthEnd = useMemo(() => endOfMonth(monthStart), [monthStart]);
  const calStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const calEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const calDays = useMemo(
    () => eachDayOfInterval({ start: calStart, end: calEnd }),
    [calStart, calEnd],
  );

  const logByDate = useMemo(() => {
    const map = new Map<string, DayLog>();
    if (historyData) {
      for (const log of historyData.logs) {
        map.set(log.date, log);
      }
    }
    return map;
  }, [historyData]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setSelectedDay(null);
    setPanelOpen(false);
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setSelectedDay(null);
    setPanelOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
    setSelectedDay(null);
    setPanelOpen(false);
  };

  const openDayPanel = (log: DayLog) => {
    setSelectedDay(log);
    setPanelOpen(true);
  };

  const closeDayPanel = () => {
    setPanelOpen(false);
    setDisputeReason('');
  };

  const handleSubmitDispute = async () => {
    if (!selectedDay || !disputeReason.trim()) return;
    setSubmittingDispute(true);
    try {
      await post('/disputes', {
        attendanceLogId: selectedDay.id,
        reason: disputeReason.trim(),
      });
      toast.success('Dispute filed', {
        description: 'Your supervisor will review this record.',
      });
      setDisputeReason('');
      fetchHistory();
    } catch {
      toast.error('Failed to file dispute', {
        description: 'Please try again or contact support.',
      });
    } finally {
      setSubmittingDispute(false);
    }
  };

  // Legend
  const legendItems = useMemo(() => {
    if (!historyData) return [];
    const items: { label: string; count: number; color: string }[] = [];
    const order = [
      'EARLY',
      'ON_TIME',
      'LATE',
      'ABSENT_UNEXCUSED',
      'ABSENT_EXCUSED',
      'DISPUTED',
      'UNRESOLVED',
      'LEFT_EARLY',
    ];
    for (const key of order) {
      if (historyData.statusCounts[key]) {
        items.push({
          label: STATUS_LABEL[key] || key,
          count: historyData.statusCounts[key],
          color: STATUS_DOT[key] || 'bg-muted',
        });
      }
    }
    if (historyData.weekendDays > 0) {
      items.push({ label: 'Weekend', count: historyData.weekendDays, color: 'bg-muted' });
    }
    if (historyData.holidayDays > 0) {
      items.push({ label: 'Holiday', count: historyData.holidayDays, color: 'bg-muted' });
    }
    return items;
  }, [historyData]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Attendance History</h1>
      </div>

      {/* Month navigation + View toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center text-sm font-medium text-[var(--text-primary)]">
            {MONTHS[viewMonth - 1]} {viewYear}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-0.5">
          <Button
            variant={viewMode === 'month' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setViewMode('month')}
          >
            <CalendarIcon className="mr-1 h-3.5 w-3.5" />
            Month
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="xs"
            onClick={() => setViewMode('list')}
          >
            <List className="mr-1 h-3.5 w-3.5" />
            List
          </Button>
        </div>
      </div>

      {/* Calendar / List */}
      {viewMode === 'month' ? (
        <>
          {historyLoading ? (
            <CalendarSkeleton />
          ) : !historyData || historyData.logs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <CalendarIcon className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">No attendance records for this month</p>
                <p className="text-xs text-muted">
                  {viewMonth === now.getMonth() + 1 && viewYear === now.getFullYear()
                    ? 'Check back once you start checking in'
                    : 'Records may not exist for this period'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-3 sm:p-4">
                {/* Day headers */}
                <div className="mb-1 grid grid-cols-7">
                  {DAY_HEADERS.map((d) => (
                    <div
                      key={d}
                      className="py-1 text-center text-[10px] font-medium uppercase text-muted"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div className="grid grid-cols-7">
                  {calDays.map((day) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const log = logByDate.get(dateStr);
                    const inMonth = isSameMonth(day, monthStart);
                    const today = isToday(day);
                    const isWeekendDay = day.getDay() === 0 || day.getDay() === 6;

                    return (
                      <button
                        key={dateStr}
                        disabled={!log}
                        onClick={() => log && openDayPanel(log)}
                        className={`relative flex flex-col items-center gap-0.5 py-2 text-xs transition-colors
                          ${!inMonth ? 'opacity-30' : ''}
                          ${log ? 'cursor-pointer hover:bg-[var(--surface-elevated)] rounded-lg' : 'cursor-default'}
                          ${today ? 'ring-1 ring-sph-green/40' : ''}
                        `}
                      >
                        <span
                          className={`text-xs font-medium ${
                            today ? 'text-sph-green' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {format(day, 'd')}
                        </span>
                        {log && (
                          <>
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[log.status] || 'bg-muted'}`}
                            />
                            {log.checkInTime && (
                              <span className="text-[8px] text-muted leading-none">
                                {formatTime(log.checkInTime)}
                              </span>
                            )}
                          </>
                        )}
                        {!log && inMonth && !isWeekendDay && (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted/30" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          {historyData && historyData.logs.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {legendItems.map((item) => (
                <span key={item.label} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                  {item.label}
                  <span className="font-medium text-[var(--text-primary)]">({item.count})</span>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>{historyLoading ? <TableSkeleton /> : <ListContent logs={historyData?.logs ?? []} />}</>
      )}

      {/* Trend chart */}
      {trendLoading ? <ChartSkeleton /> : trendData ? <TrendChart data={trendData} /> : null}

      {/* Day detail side panel (overlay on mobile, side panel on desktop) */}
      {panelOpen && selectedDay && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:bg-black/10" onClick={closeDayPanel} />
          {/* Panel */}
          <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-xl sm:bottom-auto sm:left-auto sm:right-0 sm:top-0 sm:max-h-screen sm:w-96 sm:rounded-none sm:rounded-l-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {formatDateLabel(selectedDay.date)}
                </p>
                {isToday(new Date(selectedDay.date + 'T00:00:00')) && (
                  <Badge
                    variant="outline"
                    className="mt-1 border-sph-green/30 text-[10px] text-sph-green"
                  >
                    Today
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={closeDayPanel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Status badge */}
            <div className="mb-4 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${STATUS_DOT[selectedDay.status] || 'bg-muted'}`}
              />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {STATUS_LABEL[selectedDay.status] || selectedDay.status}
              </span>
            </div>

            {/* Times */}
            <div className="mb-4 space-y-2 rounded-xl bg-[var(--surface-elevated)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Check-in</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {formatTime(selectedDay.checkInTime)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Check-out</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {selectedDay.checkOutTime ? (
                    formatTime(selectedDay.checkOutTime)
                  ) : (
                    <span className="text-sph-amber">(pending)</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Duration</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {selectedDay.hours !== null ? formatHours(selectedDay.hours) : '\u2014'}
                </span>
              </div>
            </div>

            {/* Work Log (ATTACHEE only) */}
            {isAttachee && (
              <div className="mb-4 rounded-xl bg-[var(--surface-elevated)] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Work Log</span>
                  {selectedDay.workLogId ? (
                    <Link
                      href={`/dashboard/worklog?date=${selectedDay.date}`}
                      className="flex items-center gap-1 text-xs font-medium text-sph-blue hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      Submitted
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/worklog?date=${selectedDay.date}`}
                      className="flex items-center gap-1 text-xs font-medium text-sph-amber hover:underline"
                    >
                      <FileText className="h-3 w-3" />
                      Not written
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Dispute */}
            {selectedDay.dispute ? (
              <div className="rounded-xl border border-sph-amber/20 bg-sph-amber/5 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-sph-amber" />
                  <span className="text-sm font-medium text-sph-amber">
                    {selectedDay.dispute.resolvedAt
                      ? `Resolved: ${selectedDay.dispute.resolution || 'No details'}`
                      : 'Disputed \u2014 awaiting review'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full border-sph-red/30 text-sph-red hover:bg-sph-red/10"
                  onClick={() => setDisputeReason(disputeReason ? '' : ' ')}
                >
                  <Flag className="mr-1.5 h-4 w-4" />
                  Flag this record
                </Button>
                {disputeReason.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="dispute-reason">Reason for dispute</Label>
                    <textarea
                      id="dispute-reason"
                      value={disputeReason.trimStart()}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      placeholder="Describe why this record is incorrect..."
                      className="h-24 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-sph-green/50"
                    />
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!disputeReason.trim() || submittingDispute}
                      onClick={handleSubmitDispute}
                    >
                      {submittingDispute ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Flag className="mr-1.5 h-4 w-4" />
                      )}
                      Submit Dispute
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ListContent({ logs }: { logs: DayLog[] }) {
  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <List className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">No attendance records for this period</p>
        </CardContent>
      </Card>
    );
  }
  return <RecentAttendanceTable logs={logs} showAll compact />;
}

function TrendChart({ data }: { data: TrendResponse }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Attendance Trend</CardTitle>
          <span className="text-xs text-muted">Last 12 weeks</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {data.currentScore}%
          </span>
          {data.comparison !== 0 && (
            <span
              className={`flex items-center gap-1 text-sm font-medium ${
                data.comparison > 0 ? 'text-sph-green' : 'text-sph-red'
              }`}
            >
              {data.comparison > 0 ? '\u2191' : '\u2193'} {Math.abs(data.comparison)}%
              <span className="text-xs text-muted font-normal">vs earlier</span>
            </span>
          )}
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.weeks} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="weekStart"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                tickFormatter={(v) => {
                  const d = new Date(String(v) + 'T00:00:00');
                  return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
                }}
                interval="preserveStartEnd"
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(v) => {
                  const d = new Date(String(v) + 'T00:00:00');
                  return `Week of ${d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}`;
                }}
                formatter={(value) => [`${value}%`, 'Score']}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10B981' }}
                activeDot={{ r: 5, fill: '#10B981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 grid grid-cols-7 gap-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="mx-auto h-3 w-8" />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="h-48 w-full" />
      </CardContent>
    </Card>
  );
}
