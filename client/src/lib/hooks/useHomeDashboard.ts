'use client';

import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';

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
    department: { id: string; name: string; shiftStart?: string; shiftEnd?: string } | null;
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

type HeroPhase = 'idle' | 'checked-in' | 'checked-out';

function getPhaseFromLog(log: BackendAttendanceLog | null): HeroPhase {
  if (!log) return 'idle';
  if (!log.checkInTime) return 'idle';
  if (log.checkOutTime) return 'checked-out';
  return 'checked-in';
}

export function useHomeDashboard() {
  const { user: authUser } = useAuth();

  const [data, setData] = useState<DashboardData | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<HeroPhase>('idle');
  const [checkInStatus, setCheckInStatus] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
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
  const deptName = data?.user?.department?.name ?? '';
  const cohortName = data?.user?.cohort?.name ?? '';
  const shiftStart = data?.user?.department?.shiftStart ?? '';
  const shiftEnd = data?.user?.department?.shiftEnd ?? '';
  const gracePeriodMins = data?.gracePeriodMins ?? 15;

  const greetingSubtitle = deptName
    ? `${deptName} Department${cohortName ? ` \u00B7 ${cohortName}` : ''} \u00B7 ${new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : '';

  const shiftInfo = shiftStart
    ? `Shift starts at ${shiftStart} \u00B7 Grace window closes at ${addMinutesToTime(shiftStart, gracePeriodMins)}`
    : '';

  return {
    data,
    announcements,
    isLoading,
    error,
    phase,
    checkInStatus,
    checkInTime,
    checkOutTime,
    firstName,
    deptName,
    greetingSubtitle,
    shiftInfo,
    fetchData,
    handleCheckedIn,
    handleCheckedOut,
  };
}

function addMinutesToTime(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const rh = Math.floor(total / 60) % 24;
  const rm = total % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}
