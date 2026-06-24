'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Bell, BookOpen, History, User, LogOut } from 'lucide-react';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth } from '@/context/AuthContext';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
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

  const firstName = user?.fullName?.split(' ')[0] ?? 'User';
  const initials = user ? getInitials(user.fullName) : '??';
  const role = user?.role ?? 'STAFF';
  const isAttachee = role === 'ATTACHEE';

  const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', match: '/dashboard' },
    // TODO: Uncomment when announcements page is implemented
    // {
    //   href: '/dashboard/announcements',
    //   icon: Bell,
    //   label: 'Announcements',
    //   match: '/dashboard/announcements',
    // },
    // TODO: Uncomment when worklog page is implemented
    // ...(isAttachee
    //   ? [
    //       {
    //         href: '/dashboard/worklog',
    //         icon: BookOpen,
    //         label: 'Work Log',
    //         match: '/dashboard/worklog',
    //       },
    //     ]
    //   : []),
    // TODO: Uncomment when profile page is implemented
    // { href: '/dashboard/profile', icon: User, label: 'Profile', match: '/dashboard/profile' },
  ];

  const mobileNavItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home', match: '/dashboard' },
    // TODO: Uncomment when announcements page is implemented
    // {
    //   href: '/dashboard/announcements',
    //   icon: Bell,
    //   label: 'Alerts',
    //   match: '/dashboard/announcements',
    // },
    // TODO: Uncomment when worklog/history pages are implemented
    // {
    //   href: isAttachee ? '/dashboard/worklog' : '/dashboard',
    //   icon: isAttachee ? BookOpen : History,
    //   label: isAttachee ? 'Log' : 'History',
    //   match: isAttachee ? '/dashboard/worklog' : '/dashboard/history',
    // },
    // TODO: Uncomment when profile page is implemented
    // { href: '/dashboard/profile', icon: User, label: 'Profile', match: '/dashboard/profile' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border)] surface lg:flex">
        {/* Logo */}
        <div className="flex flex-col px-5 pt-6 pb-8">
          <img
            src="/logo/swahilipot.png"
            alt="Swahilipot Hub"
            className="h-8 w-auto"
          />
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={pathname === item.match}
            />
          ))}
        </nav>

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
            className="h-6 w-auto"
          />
          <span className="text-xs text-muted">{firstName}</span>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">{children}</div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--border)] surface lg:hidden">
        {mobileNavItems.map((item) => (
          <MobileNavItem
            key={item.href + item.label}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={pathname === item.match}
          />
        ))}
      </nav>
    </div>
  );
}
