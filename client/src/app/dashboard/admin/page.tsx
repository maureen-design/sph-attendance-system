'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Building2,
  Calendar,
  Activity,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
      return;
    }
  }, [user, router]);

  useEffect(() => {
    async function fetchData() {
      try {
        const live = await get<LiveData>('/dashboard/supervisor/live');
        setLiveData(live);
      } catch {
        // handled
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  const totalUsers = liveData?.departments.reduce((sum, d) => sum + d.totalUsers, 0) ?? 0;
  const totalCheckedIn = liveData?.departments.reduce((sum, d) => sum + d.checkedIn, 0) ?? 0;
  const totalLate = liveData?.departments.reduce((sum, d) => sum + d.late, 0) ?? 0;
  const totalNotCheckedIn = liveData?.departments.reduce((sum, d) => sum + d.notCheckedIn, 0) ?? 0;
  const totalDepts = liveData?.departments.length ?? 0;

  const managementLinks = [
    {
      href: '/dashboard/users',
      icon: Users,
      label: 'Users',
      desc: 'Manage all users, roles, and access',
      color: 'text-sph-blue',
    },
    {
      href: '/dashboard/departments',
      icon: Building2,
      label: 'Departments',
      desc: 'Configure departments and shifts',
      color: 'text-sph-green',
    },
    {
      href: '/dashboard/cohorts',
      icon: Calendar,
      label: 'Cohorts',
      desc: 'Manage cohorts and attendance periods',
      color: 'text-sph-amber',
    },
    {
      href: '/dashboard/invite-links',
      icon: ShieldAlert,
      label: 'Invite Links',
      desc: 'Generate and manage registration links',
      color: 'text-sph-green',
    },
    {
      href: '/dashboard/audit-logs',
      icon: Activity,
      label: 'Audit Logs',
      desc: 'View system activity and changes',
      color: 'text-[var(--text-primary)]',
    },
    {
      href: '/dashboard/settings',
      icon: Building2,
      label: 'Settings',
      desc: 'Organization configuration',
      color: 'text-[var(--text-primary)]',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Organization-wide overview and management</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted">Total Users</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-[var(--text-primary)]">{totalUsers}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted">Active Today</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-sph-green">{totalCheckedIn}</p>
                {totalLate > 0 && (
                  <Badge variant="outline" className="text-sph-amber border-sph-amber/30">
                    {totalLate} late
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted">Departments</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-[var(--text-primary)]">{totalDepts}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm text-muted">Not Checked In</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p
                className={`text-2xl font-bold ${totalNotCheckedIn > 0 ? 'text-sph-red' : 'text-sph-green'}`}
              >
                {totalNotCheckedIn}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Departments Today</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : liveData && liveData.departments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Checked In</th>
                    <th className="px-4 py-3 font-medium">Late</th>
                    <th className="px-4 py-3 font-medium">Not Checked In</th>
                    <th className="px-4 py-3 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData.departments.map((dept) => {
                    const rate =
                      dept.totalUsers > 0
                        ? Math.round((dept.checkedIn / dept.totalUsers) * 100)
                        : 0;
                    return (
                      <tr key={dept.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                          {dept.name}
                        </td>
                        <td className="px-4 py-3 text-muted">{dept.totalUsers}</td>
                        <td className="px-4 py-3 text-sph-green">{dept.checkedIn}</td>
                        <td className="px-4 py-3">
                          {dept.late > 0 ? (
                            <span className="text-sph-amber">{dept.late}</span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {dept.notCheckedIn > 0 ? (
                            <span className="text-sph-red">{dept.notCheckedIn}</span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  rate >= 80
                                    ? 'bg-sph-green'
                                    : rate >= 50
                                      ? 'bg-sph-amber'
                                      : 'bg-sph-red'
                                }`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted">{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted">No department data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Management Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Management</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {managementLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-4 rounded-xl border border-[var(--border)] p-4 transition-colors hover:bg-[var(--surface-elevated)]"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${link.color}/10`}
              >
                <link.icon className={`h-5 w-5 ${link.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{link.label}</p>
                <p className="text-xs text-muted truncate">{link.desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
