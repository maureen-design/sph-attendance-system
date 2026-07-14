export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

const typeRoutes: Record<string, string> = {
  APPROVAL_PENDING: '/dashboard/supervisor',
  APPROVAL_GRANTED: '/dashboard',
  APPROVAL_DENIED: '/dashboard',
  EXCUSE_REQUEST: '/dashboard/supervisor',
  EXCUSE_DECISION: '/dashboard',
  ATTENDANCE_OVERRIDE: '/dashboard',
  DISPUTE_FILED: '/dashboard/disputes',
  DISPUTE_RESOLVED: '/dashboard',
  ANNOUNCEMENT: '/dashboard',
  CUTOFF_ALERT: '/dashboard/supervisor',
  CHECKOUT_REMINDER: '/dashboard',
  AUTO_CLOSE: '/dashboard',
};

export function getNotificationRoute(type: string): string {
  return typeRoutes[type] ?? '/dashboard';
}

export function getRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
}
