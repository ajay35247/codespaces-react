import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { StatsCard } from '../components/StatsCard';
import { ROLE_CARDS } from '../data/roles';

const ADMIN_EMAIL = 'ajay35247@gmail.com';

const ROLE_METRICS = {
  shipper: [
    { label: 'Active loads', value: '124', accent: 'text-sky-400' },
    { label: 'On-time delivery', value: '98%', accent: 'text-emerald-400' },
    { label: 'Invoice value', value: '₹78.4L', accent: 'text-orange-400' },
  ],
  driver: [
    { label: 'Trips today', value: '16', accent: 'text-sky-400' },
    { label: 'Earnings', value: '₹46,200', accent: 'text-emerald-400' },
    { label: 'Performance score', value: '89%', accent: 'text-orange-400' },
  ],
  'fleet-manager': [
    { label: 'Trucks active', value: '84', accent: 'text-sky-400' },
    { label: 'Utilization', value: '72%', accent: 'text-emerald-400' },
    { label: 'Maintenance alerts', value: '4', accent: 'text-orange-400' },
  ],
  broker: [
    { label: 'Open bids', value: '43', accent: 'text-sky-400' },
    { label: 'Commission', value: '₹15.2L', accent: 'text-emerald-400' },
    { label: 'Contracts', value: '18', accent: 'text-orange-400' },
  ],
  admin: [
    { label: 'Active sessions', value: '1.2K', accent: 'text-sky-400' },
    { label: 'Revenue', value: '₹12.8Cr', accent: 'text-emerald-400' },
    { label: 'Alerts', value: '9', accent: 'text-orange-400' },
  ],
};

export function RoleDashboard() {
  const { role } = useParams();
  const authRole = useSelector((state) => state.auth.role);
  const authUser = useSelector((state) => state.auth.user);

  const card = useMemo(() => ROLE_CARDS.find((item) => item.key === role), [role]);
  const metrics = ROLE_METRICS[role] || [];

  if (!authRole || role !== authRole) {
    return <Navigate to="/" replace />;
  }

  if (authRole === 'admin' && authUser?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">{card?.label || 'Dashboard'}</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">{card?.label || 'Overview'}</h1>
        <p className="mt-4 text-slate-300">{card ? `A role-based dashboard for ${card.label}` : 'Select a role from the home page.'}</p>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {metrics.map((metric) => (
            <StatsCard key={metric.label} label={metric.label} value={metric.value} accent={metric.accent} />
          ))}
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
            <h2 className="text-xl font-semibold text-white">Key workflows</h2>
            <ul className="mt-5 space-y-3 text-slate-300">
              <li>• Secure login and role-based navigation.</li>
              <li>• Live shipments, bids, dispatch and payments.</li>
              <li>• Advanced analytics cards and KPI snapshots.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
            <h2 className="text-xl font-semibold text-white">Platform modules</h2>
            <ul className="mt-5 space-y-3 text-slate-300">
              <li>• Freight marketplace, escrow, GST billing.</li>
              <li>• Real-time GPS tracking, route optimization.</li>
              <li>• AI logistics, fraud detection, dispatch engine.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
