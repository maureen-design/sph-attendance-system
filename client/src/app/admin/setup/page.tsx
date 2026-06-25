'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { SetupWizard } from '@/components/admin/SetupWizard';

export default function AdminSetupPage() {
  const router = useRouter();

  const handleComplete = () => {
    router.push('/dashboard');
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-[var(--background)] px-4 py-8 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] lg:text-3xl">
              Setup Your Organization
            </h1>
            <p className="mt-2 text-sm text-secondary">
              Complete these steps to configure your attendance system.
            </p>
          </div>
          <SetupWizard onComplete={handleComplete} />
        </div>
      </div>
    </AuthGuard>
  );
}
