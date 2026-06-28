'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Shield,
  Users,
  Building2,
  Calendar,
  Link as LinkIcon,
  ClipboardList,
  Settings,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/context/AuthContext';

const ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DEPARTMENT_SUPERVISOR: 'DEPARTMENT_SUPERVISOR',
  STAFF: 'STAFF',
  MEMBER: 'MEMBER',
  ATTACHEE: 'ATTACHEE',
} as const;

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function isActive(pathname: string, match: string): boolean {
  if (match === '/dashboard') return pathname === '/dashboard';
  return pathname === match || pathname.startsWith(match + '/');
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active
          ? 'border-l-2 border-sph-green bg-sph-green/10 text-sph-green'
          : 'text-secondary hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function MobileNavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
        active ? 'text-sph-green' : 'text-secondary'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ErrorBoundary>
        <DashboardShell>{children}</DashboardShell>
      </ErrorBoundary>
    </AuthGuard>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sph-theme');
    if (savedTheme === 'light') {
      setIsLightMode(true);
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isLightMode;
    setIsLightMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('light');
      localStorage.setItem('sph-theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('sph-theme', 'dark');
    }
  };

  const firstName = user?.fullName?.split(' ')[0] ?? 'User';
  const initials = user ? getInitials(user.fullName) : '??';
  const role = user?.role ?? 'STAFF';

  const isAdmin = role === ROLE.SUPER_ADMIN;
  const isSupervisor = role === ROLE.DEPARTMENT_SUPERVISOR;

  const primaryNavItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', match: '/dashboard' },
    ...(isAdmin
      ? [
          {
            href: '/dashboard/admin',
            icon: Shield,
            label: 'Admin Dashboard',
            match: '/dashboard/admin',
          },
        ]
      : []),
    ...(isSupervisor
      ? [
          {
            href: '/dashboard/supervisor',
            icon: Shield,
            label: 'Supervisor',
            match: '/dashboard/supervisor',
          },
        ]
      : []),
  ];

  const adminNavItems = isAdmin
    ? [
        { href: '/dashboard/users', icon: Users, label: 'Users', match: '/dashboard/users' },
        {
          href: '/dashboard/departments',
          icon: Building2,
          label: 'Departments',
          match: '/dashboard/departments',
        },
        {
          href: '/dashboard/cohorts',
          icon: Calendar,
          label: 'Cohorts',
          match: '/dashboard/cohorts',
        },
        {
          href: '/dashboard/invite-links',
          icon: LinkIcon,
          label: 'Invite Links',
          match: '/dashboard/invite-links',
        },
        {
          href: '/dashboard/audit-logs',
          icon: ClipboardList,
          label: 'Audit Logs',
          match: '/dashboard/audit-logs',
        },
        {
          href: '/dashboard/settings',
          icon: Settings,
          label: 'Settings',
          match: '/dashboard/settings',
        },
      ]
    : [];

  const mobileNavItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', match: '/dashboard' },
    ...(isAdmin
      ? [{ href: '/dashboard/admin', icon: Shield, label: 'Admin', match: '/dashboard/admin' }]
      : []),
    ...(isSupervisor
      ? [
          {
            href: '/dashboard/supervisor',
            icon: Shield,
            label: 'Supervisor',
            match: '/dashboard/supervisor',
          },
        ]
      : []),
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] surface lg:flex">
        {/* Logo — visual anchor only */}
        <div className="flex flex-col px-5 pt-6 pb-6">
          <img
            src="/logo/swahilipot.png"
            alt="Swahilipot Hub"
            className="h-8 w-auto cursor-default pointer-events-none"
          />
        </div>

        {/* Primary Nav */}
        <nav className="flex flex-col gap-1 px-3">
          {primaryNavItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(pathname, item.match)}
            />
          ))}
        </nav>

        {/* Admin Nav Section */}
        {adminNavItems.length > 0 && (
          <>
            <div className="mt-4 mb-1 px-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                Management
              </p>
            </div>
            <nav className="flex flex-col gap-1 px-3">
              {adminNavItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(pathname, item.match)}
                />
              ))}
            </nav>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User area */}
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sph-green/20 text-xs font-bold text-sph-green">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {user?.fullName ?? 'User'}
            </p>
            <span className="text-[10px] text-muted">{role}</span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="Toggle theme"
          >
            {isLightMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-[var(--text-muted)] transition-colors hover:text-sph-red"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 lg:hidden">
          <img
            src="/logo/swahilipot.png"
            alt="Swahilipot Hub"
            className="h-6 w-auto cursor-default pointer-events-none"
          />
          <span className="text-xs text-muted">{firstName}</span>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] surface lg:hidden">
        {mobileNavItems.map((item) => (
          <MobileNavItem
            key={item.href + item.label}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={isActive(pathname, item.match)}
          />
        ))}
        <button
          type="button"
          onClick={toggleTheme}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-secondary transition-colors hover:text-[var(--text-primary)]"
          aria-label="Toggle theme"
        >
          {isLightMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-secondary transition-colors hover:text-sph-red"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </nav>
    </div>
  );
}
