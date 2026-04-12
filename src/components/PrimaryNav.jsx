import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../features/auth/authSlice';

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Tracking', to: '/tracking' },
  { label: 'GST Billing', to: '/gst' },
  { label: 'Payment', to: '/payment' },
  { label: 'Contact', to: '/contact' },
];

export function PrimaryNav() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/');
  };

  const authItems = token
    ? [
        { label: 'Dashboard', to: `/dashboard/${user?.role || 'shipper'}` },
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
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'
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
            className="rounded-full px-4 py-2 text-sm font-medium transition bg-white/10 text-slate-200 hover:bg-white/15"
          >
            {item.label}
          </button>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive ? 'bg-white text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'
              }`
            }
          >
            {item.label}
          </NavLink>
        )
      )}
    </nav>
  );
}
