'use client';

import { useCallback } from 'react';
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
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useNotifications } from '@/hooks/useNotifications';
import { getRelativeTime, getNotificationRoute } from '@/lib/notifications';
import type { NotificationItem } from '@/lib/notifications';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

export default function NotificationsPage() {
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const router = useRouter();

  const handleClick = useCallback(
    async (n: NotificationItem) => {
      if (!n.isRead) await markAsRead(n.id);
      router.push(getNotificationRoute(n.type));
    },
    [markAsRead, router],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-muted transition-colors hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Notifications</h1>
          <p className="text-sm text-muted">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Bell className="h-10 w-10 text-muted" />
              <p className="text-base font-medium text-[var(--text-primary)]">
                You&apos;re all caught up
              </p>
              <p className="text-sm text-muted">No notifications yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {notifications.map((n) => {
                const Icon = getIcon(n.type);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-elevated)]/50 ${
                      !n.isRead ? 'bg-sph-green/[0.03]' : ''
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        !n.isRead ? 'bg-sph-green/15' : 'bg-[var(--surface-elevated)]'
                      }`}
                    >
                      <Icon className={`h-5 w-5 ${!n.isRead ? 'text-sph-green' : 'text-muted'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-snug ${
                            !n.isRead
                              ? 'font-semibold text-[var(--text-primary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sph-green" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                      <p className="mt-1 text-xs text-muted">{getRelativeTime(n.createdAt)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
