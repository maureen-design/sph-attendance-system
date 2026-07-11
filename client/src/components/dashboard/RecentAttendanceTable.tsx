'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardAction, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface AttendanceRow {
  id: string;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  hours: number | null;
  checkInMethod?: string | null;
  checkOutMethod?: string | null;
}

interface RecentAttendanceTableProps {
  logs: AttendanceRow[];
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case 'ON_TIME':
      return { text: 'On-Time', className: 'text-sph-green' };
    case 'EARLY':
      return { text: 'Early', className: 'text-sph-green' };
    case 'LATE':
      return { text: 'Late', className: 'text-sph-amber' };
    case 'LEFT_EARLY':
      return { text: 'Left Early', className: 'text-sph-amber' };
    case 'UNRESOLVED':
      return { text: 'Unresolved', className: 'text-sph-red' };
    case 'ABSENT_EXCUSED':
      return { text: 'Excused', className: 'text-muted' };
    case 'ABSENT_UNEXCUSED':
      return { text: 'Absent', className: 'text-sph-red' };
    case 'DISPUTED':
      return { text: 'Disputed', className: 'text-sph-amber' };
    default:
      return { text: status ?? '--', className: 'text-muted' };
  }
}

function formatHours(hours: number | null): string {
  if (hours === null || hours === undefined) return '--';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function RecentAttendanceTable({ logs }: RecentAttendanceTableProps) {
  const recent = logs.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Attendance</CardTitle>
        <CardAction>
          <Link href="/dashboard/history" className="text-xs text-sph-blue hover:underline">
            Full history →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {recent.length === 0 ? (
          <p className="px-(--card-spacing) pb-4 text-sm text-muted">No recent records</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Check-In</TableHead>
                <TableHead>Check-Out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((log) => {
                const st = statusLabel(log.status);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-[var(--text-primary)]">
                      {formatDate(log.date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTime(log.checkInTime)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTime(log.checkOutTime)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${st.className}`}>{st.text}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatHours(log.hours)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
