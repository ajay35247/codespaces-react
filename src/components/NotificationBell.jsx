import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationReceived,
} from '../features/notifications/notificationsSlice';
import { useSocket } from '../hooks/useSocket';

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const { items, unreadCount, loading } = useSelector((s) => s.notifications);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Initial fetch when authenticated.
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchNotifications());
    }
  }, [dispatch, user?.id]);

  // Live push — every new server-side notification lands here.
  useSocket('notification', (payload) => {
    dispatch(notificationReceived(payload));
  });

  // Click-outside-to-close.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!user?.id) return null;

  const handleItemClick = (notification) => {
    if (!notification.readAt) {
      dispatch(markNotificationRead(notification.id));
    }
    if (notification.link) {
      navigate(notification.link);
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/15 theme-chip"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-slate-950/40 theme-panel"
          role="menu"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white theme-heading">Notifications</p>
            {items.some((n) => !n.readAt) && (
              <button
                type="button"
                onClick={() => dispatch(markAllNotificationsRead())}
                className="text-xs text-sky-300 hover:text-sky-200"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-white/5">
            {loading && items.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-400">Loading…</li>
            )}
            {!loading && items.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-400">No notifications yet.</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                    !n.readAt ? 'bg-sky-500/5' : ''
                  }`}
                >
                  <span
                    className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                      !n.readAt ? 'bg-sky-400' : 'bg-slate-700'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white theme-heading">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs text-slate-300 theme-muted">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
