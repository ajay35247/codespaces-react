import { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { StatsCard } from '../components/StatsCard';
import { ROLE_CARDS } from '../data/roles';
import { apiRequest } from '../utils/api';

const ROLE_ACTIONS = {
  shipper: [
    { label: 'Create Load', path: '/shipper' },
    { label: 'View My Loads', path: '/shipper' },
    { label: 'GST Billing', path: '/gst' },
    { label: 'Payments', path: '/payment' },
  ],
  driver: [
    { label: 'View My Trips', path: '/driver' },
    { label: 'Available Loads', path: '/driver' },
    { label: 'Toll Tax & FASTag', path: '/tolls' },
    { label: 'GPS Tracking', path: '/tracking' },
  ],
  'fleet-manager': [
    { label: 'Fleet Operations', path: '/fleet' },
    { label: 'Register Vehicle', path: '/fleet' },
    { label: 'Toll Tax & FASTag', path: '/tolls' },
    { label: 'GPS Tracking', path: '/tracking' },
    { label: 'GST Billing', path: '/gst' },
  ],
  broker: [
    { label: 'Browse Loads', path: '/broker' },
    { label: 'My Bids', path: '/broker' },
    { label: 'Payments', path: '/payment' },
  ],
};

function formatStat(value, role, key) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (key === 'commission' || key === 'invoiceValue' || key === 'earnings' || key === 'totalFreight') {
    return `₹${Number(value).toLocaleString('en-IN')}`;
  }
  return String(value);
}

function buildMetrics(role, stats) {
  if (!stats) return [];
  switch (role) {
    case 'shipper':
      return [
        { label: 'Active loads', value: formatStat(stats.activeLoads, role, 'activeLoads'), accent: 'text-sky-400' },
        { label: 'On-time delivery', value: formatStat(stats.onTimeDelivery, role, 'onTimeDelivery'), accent: 'text-emerald-400' },
        { label: 'Invoice value', value: formatStat(stats.invoiceValue, role, 'invoiceValue'), accent: 'text-orange-400' },
      ];
    case 'driver':
      return [
        { label: 'Trips today', value: formatStat(stats.tripsToday, role, 'tripsToday'), accent: 'text-sky-400' },
        { label: 'Earnings', value: formatStat(stats.earnings, role, 'earnings'), accent: 'text-emerald-400' },
        { label: 'Performance score', value: formatStat(stats.performanceScore, role, 'performanceScore'), accent: 'text-orange-400' },
      ];
    case 'fleet-manager':
      return [
        { label: 'Trucks active', value: formatStat(stats.trucksActive, role, 'trucksActive'), accent: 'text-sky-400' },
        { label: 'Utilization', value: formatStat(stats.utilization, role, 'utilization'), accent: 'text-emerald-400' },
        { label: 'Maintenance alerts', value: formatStat(stats.maintenanceAlerts, role, 'maintenanceAlerts'), accent: 'text-orange-400' },
      ];
    case 'broker':
      return [
        { label: 'Open bids', value: formatStat(stats.openBids, role, 'openBids'), accent: 'text-sky-400' },
        { label: 'Commission', value: formatStat(stats.commission, role, 'commission'), accent: 'text-emerald-400' },
        { label: 'Contracts', value: formatStat(stats.contracts, role, 'contracts'), accent: 'text-orange-400' },
      ];
    default:
      return [];
  }
}

export function RoleDashboard() {
  const { role } = useParams();
  const authRole = useSelector((state) => state.auth.role);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const card = ROLE_CARDS.find((item) => item.key === role);
  const actions = ROLE_ACTIONS[role] || [];

  useEffect(() => {
    if (!authRole || role !== authRole) return;
    setLoading(true);
    apiRequest('/dashboard/stats')
      .then((data) => setStats(data.stats || null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [role, authRole]);

  if (!authRole || role !== authRole) {
    return <Navigate to="/" replace />;
  }

  const metrics = buildMetrics(role, stats);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">{card?.label || 'Dashboard'}</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">{card?.label || 'Overview'} Dashboard</h1>
        <p className="mt-4 text-slate-300">Live platform data for your {card?.label || role} account.</p>

        {error && <p className="mt-4 text-sm text-orange-300">{error}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl border border-white/10 bg-slate-900/80" />
              ))
            : metrics.map((metric) => (
                <StatsCard key={metric.label} label={metric.label} value={metric.value} accent={metric.accent} />
              ))}
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
            <h2 className="text-xl font-semibold text-white">Quick actions</h2>
            <div className="mt-5 flex flex-wrap gap-3">
              {actions.map((action) => (
                <Link
                  key={action.label}
                  to={action.path}
                  className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
                >
                  {action.label}
                </Link>
              ))}
            </div>
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
