'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { post, clearTokens, setTokens } from '@/lib/api';

// ── Types ──

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  organizationId: string;
  departmentId: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, orgShortName: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface RefreshResponse {
  accessToken: string;
}

// ── Context ──

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ──

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount: validate stored refresh token
  useEffect(() => {
    const initAuth = async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await post<RefreshResponse>('/auth/refresh', { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);

        // Decode user from the new access token
        const tokenParts = data.accessToken.split('.');
        const payload = JSON.parse(atob(tokenParts[1])) as User;
        setUser({
          id: payload.id,
          fullName: payload.fullName ?? '',
          email: payload.email ?? '',
          role: payload.role,
          organizationId: payload.organizationId,
          departmentId: payload.departmentId ?? null,
        });
      } catch {
        clearTokens();
      } finally {
        setIsLoading(false);
      }
    };

    void initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string, orgShortName: string) => {
    const data = await post<LoginResponse>('/auth/login', {
      email,
      password,
      orgShortName,
    });

    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await post('/auth/logout', { refreshToken });
      }
    } catch {
      // Proceed even if logout API fails
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
