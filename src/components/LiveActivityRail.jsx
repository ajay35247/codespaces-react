import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationReceived,
} from '../features/notifications/notificationsSlice';
import { useSocket } from '../hooks/useSocket';
import { SmartDecisionWidget } from './SmartDecisionWidget';

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return '';
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const NOTIF_ICON = {
  'bid:placed':         '💰',
  'bid:accepted':       '✅',
  'bid:rejected':       '❌',
  'load:status-changed':'🚛',
  'payment:released':   '💸',
  'payment:received':   '💵',
  'kyc:approved':       '🔐',
  'kyc:rejected':       '⚠️',
};

/**
 * Right-side live activity rail used inside DashboardShell.
 *
 * Tab 1 – Alerts  : real-time notification feed (uses existing Redux slice)
 * Tab 2 – Actions : SmartDecisionWidget with role-based 1-click suggestions
 *
 * Props:
 *   onClose – called when the user clicks the collapse chevron
 */
export function LiveActivityRail({ onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, unreadCount, loading } = useSelector((s) => s.notifications);
  const [railTab, setRailTab] = useState('activity');

  // Push new notifications into Redux in real time.
  useSocket('notification', (payload) => {
    dispatch(notificationReceived(payload));
  });

  const handleItemClick = (notification) => {
    if (!notification.readAt) {
      dispatch(markNotificationRead(notification.id));
    }
    if (notification.link) navigate(notification.link);
  };

  const recent = items.slice(0, 10);

  return (
    <div className="flex h-full w-[280px] flex-col">
      {/* ── Rail header ── */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="live-dot h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Live Activity
          </span>
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white transition"
              aria-label="Collapse activity rail"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-white/5 shrink-0">
        {[
          { id: 'activity', label: '🔔 Alerts' },
          { id: 'actions',  label: '⚡ Actions' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRailTab(tab.id)}
            className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition ${
              railTab === tab.id
                ? 'border-b-2 border-orange-400 text-orange-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {railTab === 'activity' && (
          <div>
            {unreadCount > 0 && (
              <div className="px-4 pt-3 pb-1">
                <button
                  type="button"
                  onClick={() => dispatch(markAllNotificationsRead())}
                  className="text-[11px] text-sky-400 hover:text-sky-300 transition"
                >
                  Mark all as read
                </button>
              </div>
            )}
            {loading && recent.length === 0 && (
              <div className="px-4 py-8 text-center text-xs text-slate-500">Loading…</div>
            )}
            {!loading && recent.length === 0 && (
              <div className="px-4 py-10 text-center">
                <p className="text-2xl mb-2">🔕</p>
                <p className="text-xs text-slate-500">All clear — no alerts.</p>
              </div>
            )}
            <ul className="divide-y divide-white/4">
              {recent.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/4 ${
                      !n.readAt ? 'bg-sky-500/5' : ''
                    }`}
                  >
                    <span className="mt-0.5 text-base leading-none shrink-0">
                      {NOTIF_ICON[n.type] || '📣'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs font-semibold truncate ${!n.readAt ? 'text-white' : 'text-slate-300'}`}>
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-[11px] text-slate-500 line-clamp-2">{n.body}</span>
                      )}
                      <span className="mt-1 block text-[10px] text-slate-600">{relativeTime(n.createdAt)}</span>
                    </span>
                    {!n.readAt && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {items.length > 10 && (
              <div className="px-4 py-3 text-center">
                <span className="text-[11px] text-slate-600">
                  +{items.length - 10} older alerts
                </span>
              </div>
            )}
          </div>
        )}

        {railTab === 'actions' && (
          <div className="p-3">
            <SmartDecisionWidget compact />
          </div>
        )}
      </div>
    </div>
  );
}
