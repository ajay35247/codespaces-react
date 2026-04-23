import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../features/auth/authSlice';
import { notificationsReset } from '../features/notifications/notificationsSlice';
import { closeSharedSocket } from '../hooks/useSocket';
import { NotificationBell } from './NotificationBell';
import { useTheme } from './ThemeProvider';

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Tracking', to: '/tracking' },
  { label: 'GST Billing', to: '/gst' },
  { label: 'KYC & Payouts', to: '/kyc' },
  { label: 'Payment', to: '/payment' },
  { label: 'Contact', to: '/contact' },
];

function dashboardPath(role) {
  // Truck owners have a dedicated page; other roles use the generic
  // /dashboard/:role switchboard.
  if (role === 'truck_owner') return '/truck-owner';
  if (role && role !== 'admin') return `/dashboard/${role}`;
  return '/dashboard/shipper';
}

export function PrimaryNav() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    dispatch(logoutUser()).finally(() => {
      dispatch(notificationsReset());
      closeSharedSocket();
      navigate('/');
    });
  };

  const authItems = user
    ? [
        { label: 'Dashboard', to: dashboardPath(user?.role) },
        { label: 'Logout', action: handleLogout },
      ]
    : [
        { label: 'Login', to: '/login' },
        { label: 'Register', to: '/register' },
      ];

  return (
    <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3 px-6 py-4 sm:px-10">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `theme-chip rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive ? 'bg-white text-slate-950 theme-chip-active' : 'bg-white/10 text-slate-200 hover:bg-white/15'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
      {authItems.map((item) =>
        item.action ? (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className="theme-chip rounded-full px-4 py-2 text-sm font-medium transition bg-white/10 text-slate-200 hover:bg-white/15"
          >
            {item.label}
          </button>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `theme-chip rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive ? 'bg-white text-slate-950 theme-chip-active' : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`
            }
          >
            {item.label}
          </NavLink>
        )
      )}
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-chip rounded-full bg-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/15"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      {user?.id && <NotificationBell />}
    </nav>
  );
}
