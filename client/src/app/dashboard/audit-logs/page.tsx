'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';

export default function AuditLogsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, router]);

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin Dashboard
      </Link>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-elevated)]">
            <ClipboardList className="h-7 w-7 text-[var(--text-primary)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Audit Logs</h1>
          <p className="max-w-sm text-center text-sm text-muted">
            View system activity, track changes to users and settings, and monitor access. This page
            is under construction.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
