'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';

export default function SettingsPage() {
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
            <Settings className="h-7 w-7 text-[var(--text-primary)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Settings</h1>
          <p className="max-w-sm text-center text-sm text-muted">
            Configure organization settings, branding, email, and system preferences. This page is
            under construction.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
