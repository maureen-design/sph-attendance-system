'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { get } from '@/lib/api';

interface AuthGuardProps {
  children: React.ReactNode;
}

interface SetupStatus {
  setupRequired: boolean;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSetupAndAuth = async () => {
      try {
        // Check if initial setup is required
        const status = await get<SetupStatus>('/setup/status');
        if (status.setupRequired) {
          router.replace('/setup');
          return;
        }
      } catch {
        // If status check fails, proceed normally
      }

      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }

      setIsChecking(false);
    };

    if (!isLoading) {
      void checkSetupAndAuth();
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading while auth state is resolving
  if (isLoading || isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sph-green border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
