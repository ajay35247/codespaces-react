import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../features/auth/authSlice';
import { notificationsReset } from '../features/notifications/notificationsSlice';
import { closeSharedSocket } from '../hooks/useSocket';
import { useTheme } from './ThemeProvider';

const ROLE_META = {
  shipper:     { icon: '🚢', label: 'Shipper',      color: 'text-sky-400' },
  driver:      { icon: '🚛', label: 'Driver',       color: 'text-amber-400' },
  broker:      { icon: '🤝', label: 'Broker',       color: 'text-emerald-400' },
  truck_owner: { icon: '🏭', label: 'Fleet Owner',  color: 'text-violet-400' },
  admin:       { icon: '⚡', label: 'Admin',        color: 'text-rose-400' },
};

const ROLE_NAV = {
  shipper: [
    { icon: '📊', label: 'Dashboard',    to: '/dashboard/shipper' },
    { icon: '📦', label: 'My Loads',     to: '/shipper' },
    { icon: '📍', label: 'Live Tracking',to: '/tracking' },
    { icon: '💰', label: 'Payments',     to: '/payment' },
    { icon: '🧾', label: 'GST & Invoice',to: '/gst' },
    { icon: '💳', label: 'Wallet',       to: '/wallet' },
    { icon: '📜', label: 'Subscription', to: '/subscription' },
    { icon: '🔐', label: 'KYC',          to: '/kyc' },
  ],
  driver: [
    { icon: '🚛', label: 'My Trips',     to: '/driver' },
    { icon: '📍', label: 'Share GPS',    to: '/driver/live' },
    { icon: '⚡', label: 'FASTag & Tolls',to: '/tolls' },
    { icon: '💳', label: 'Wallet',       to: '/wallet' },
    { icon: '🗺️', label: 'Live Tracking',to: '/tracking' },
    { icon: '🔐', label: 'KYC',          to: '/kyc' },
  ],
  broker: [
    { icon: '📊', label: 'Overview',      to: '/dashboard/broker' },
    { icon: '🔄', label: 'Deal Pipeline', to: '/broker' },
    { icon: '💳', label: 'Wallet',        to: '/wallet' },
    { icon: '📜', label: 'Subscription',  to: '/subscription' },
    { icon: '🔐', label: 'KYC',           to: '/kyc' },
  ],
  truck_owner: [
    { icon: '🏭', label: 'Fleet Dashboard',to: '/truck-owner' },
    { icon: '🗺️', label: 'Live Tracking',  to: '/tracking' },
    { icon: '💳', label: 'Wallet',         to: '/wallet' },
    { icon: '🔐', label: 'KYC',            to: '/kyc' },
    { icon: '📜', label: 'Subscription',   to: '/subscription' },
  ],
};

const COMMON_BOTTOM = [
  { icon: '👤', label: 'My Profile', to: '/profile' },
  { icon: '❓', label: 'Help & FAQ',  to: '/faq' },
  { icon: '📞', label: 'Contact',    to: '/contact' },
];

/**
 * Collapsible role-aware left navigation panel used inside DashboardShell.
 *
 * Props:
 *   expanded     – whether the nav is in wide (240 px) or icon-only (64 px) mode
 *   onToggle     – called when the collapse/expand button is clicked
 *   mobileClose  – if true the toggle button shows an ✕ icon (mobile drawer)
 */
export function SmartNav({ expanded, onToggle, mobileClose = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const unreadCount = useSelector((s) => s.notifications.unreadCount);
  const { theme, toggleTheme } = useTheme();

  const role = user?.role;
  const meta = ROLE_META[role] || ROLE_META.shipper;
  const navItems = ROLE_NAV[role] || ROLE_NAV.shipper;

  const handleLogout = () => {
    dispatch(logoutUser()).finally(() => {
      dispatch(notificationsReset());
      closeSharedSocket();
      navigate('/');
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto py-3">
      {/* ── Brand header + collapse toggle ── */}
      <div className="flex items-center justify-between px-3 pb-3 shrink-0 border-b border-white/5">
        {expanded ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-xs font-black text-slate-950">
              ST
            </div>
            <span className="text-xs font-bold text-white truncate">Speedy Trucks</span>
          </div>
        ) : (
          <div className="mx-auto h-7 w-7 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center text-xs font-black text-slate-950">
            ST
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white transition ml-1"
          aria-label={mobileClose ? 'Close navigation' : expanded ? 'Collapse navigation' : 'Expand navigation'}
        >
          {mobileClose ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : expanded ? (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Role badge ── */}
      {user && (
        <div className={`mx-3 mt-3 rounded-2xl border border-white/8 bg-white/4 shrink-0 ${expanded ? 'flex items-center gap-2 px-3 py-2' : 'flex justify-center py-2'}`}>
          {expanded ? (
            <>
              <span className="text-lg leading-none">{meta.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-bold truncate ${meta.color}`}>{meta.label}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.name}</p>
              </div>
              {unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-xl leading-none">{meta.icon}</span>
          )}
        </div>
      )}

      {/* ── Role-specific nav items ── */}
      <nav className="mt-3 flex-1 px-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/driver' || item.to.includes('/dashboard')}
            title={!expanded ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition ${
                isActive
                  ? 'bg-orange-500/15 text-orange-300 font-semibold'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <span className="text-base leading-none shrink-0 w-5 text-center">{item.icon}</span>
            {expanded && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* ── Bottom utilities ── */}
      <div className="shrink-0 border-t border-white/5 pt-2 px-2 space-y-0.5">
        {COMMON_BOTTOM.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={!expanded ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition ${
                isActive
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`
            }
          >
            <span className="text-base leading-none shrink-0 w-5 text-center">{item.icon}</span>
            {expanded && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}

        <button
          type="button"
          onClick={toggleTheme}
          title={!expanded ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-300 transition"
        >
          <span className="text-base leading-none shrink-0 w-5 text-center">
            {theme === 'dark' ? '☀️' : '🌙'}
          </span>
          {expanded && <span className="truncate">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          title={!expanded ? 'Logout' : undefined}
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 transition"
        >
          <span className="text-base leading-none shrink-0 w-5 text-center">🚪</span>
          {expanded && <span className="truncate">Logout</span>}
        </button>
      </div>
    </div>
  );
}
