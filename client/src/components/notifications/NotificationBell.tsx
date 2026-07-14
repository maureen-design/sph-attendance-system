'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCircle,
  UserPlus,
  XCircle,
  Calendar,
  Edit,
  MessageSquare,
  Megaphone,
  AlertTriangle,
  Clock,
  Loader2,
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { getRelativeTime, getNotificationRoute, type NotificationItem } from '@/lib/notifications';

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  APPROVAL_PENDING: UserPlus,
  APPROVAL_GRANTED: CheckCircle,
  APPROVAL_DENIED: XCircle,
  EXCUSE_REQUEST: Calendar,
  EXCUSE_DECISION: CheckCircle,
  ATTENDANCE_OVERRIDE: Edit,
  DISPUTE_FILED: MessageSquare,
  DISPUTE_RESOLVED: CheckCircle,
  ANNOUNCEMENT: Megaphone,
  CUTOFF_ALERT: AlertTriangle,
  CHECKOUT_REMINDER: Clock,
  AUTO_CLOSE: Clock,
};

function getIcon(type: string) {
  return typeIcons[type] ?? Bell;
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const recentNotifications = notifications.slice(0, 15);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClick);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  const handleNotificationClick = useCallback(
    async (n: NotificationItem) => {
      if (!n.isRead) await markAsRead(n.id);
      setOpen(false);
      router.push(getNotificationRoute(n.type));
    },
    [markAsRead, router],
  );

  const displayCount = unreadCount > 9 ? '9+' : unreadCount;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sph-red px-1 text-[10px] font-bold leading-none text-white">
            {displayCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl ring-1 ring-black/5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-xs text-sph-green transition-colors hover:text-sph-green/80"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell className="h-8 w-8 text-muted" />
                <p className="text-sm text-muted">You&apos;re all caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {recentNotifications.map((n) => {
                  const Icon = getIcon(n.type);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-elevated)]/50 ${
                        !n.isRead ? 'bg-sph-green/[0.03]' : ''
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          !n.isRead ? 'bg-sph-green/15' : 'bg-[var(--surface-elevated)]'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${!n.isRead ? 'text-sph-green' : 'text-muted'}`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm leading-snug ${
                            !n.isRead
                              ? 'font-semibold text-[var(--text-primary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted line-clamp-2">{n.body}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {getRelativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.isRead && (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-sph-green" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] px-4 py-2.5">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-sph-green transition-colors hover:text-sph-green/80"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
