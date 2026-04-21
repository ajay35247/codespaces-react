import { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { StatsCard } from '../components/StatsCard';
import { Card3D } from '../components/Card3D';
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

/** Enhanced 3D hero section for the role dashboard. */
function TruckScene3D({ title, description, role }) {
  const ROLE_META = {
    shipper:        { glow: 'rgba(56,189,248,0.18)',  accent: 'rgba(249,115,22,0.14)', badge: '🚢 Shipper View' },
    driver:         { glow: 'rgba(249,115,22,0.18)',  accent: 'rgba(251,191,36,0.14)', badge: '🧑‍✈️ Driver View' },
    'fleet-manager':{ glow: 'rgba(139,92,246,0.18)',  accent: 'rgba(56,189,248,0.14)', badge: '🏗️ Fleet View' },
    broker:         { glow: 'rgba(52,211,153,0.18)',  accent: 'rgba(249,115,22,0.14)', badge: '🤝 Broker View' },
  };
  const meta = ROLE_META[role] || ROLE_META.shipper;

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-slate-950/92 p-8 shadow-2xl shadow-slate-900/25 ring-1 ring-white/10 sm:p-10">
      {/* Animated mesh gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 18% 22%, ${meta.glow}, transparent 44%),
                       radial-gradient(circle at 82% 72%, ${meta.accent}, transparent 40%)`,
        }}
      />
      <div className="perspective-grid absolute inset-0 opacity-40" />

      <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]" style={{ perspective: '1200px' }}>
        {/* Left: text */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
            <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
            {meta.badge}
          </div>
          <h2 className="mt-3 text-4xl font-black leading-tight text-white">{title}</h2>
          <p className="mt-4 text-slate-300">{description}</p>
        </motion.div>

        {/* Right: 3D floating panel */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1 }}
          className="relative mx-auto w-full max-w-sm float-3d"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Depth layers */}
          <div className="absolute inset-0 rounded-3xl border border-cyan-400/18 bg-cyan-500/8 [transform:translateZ(-32px)_rotateX(7deg)_rotateY(-9deg)]" />
          <div className="absolute inset-2.5 rounded-3xl border border-white/8 bg-slate-900/55 [transform:translateZ(-12px)_rotateX(5deg)_rotateY(-6deg)]" />

          {/* Main floating card */}
          <div className="relative rounded-3xl border border-white/15 bg-slate-950/88 p-5 backdrop-blur-xl [transform:translateZ(28px)_rotateX(3deg)_rotateY(-3deg)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Live Lane</p>
              <span className="live-dot h-2 w-2 rounded-full bg-orange-400" />
            </div>

            {/* Road animation — uses global CSS classes */}
            <div className="st-road h-20 overflow-hidden rounded-2xl border border-white/8">
              <div className="st-road-lines" aria-hidden="true" />
              <div className="st-truck" aria-hidden="true">
                <div className="st-cabin" />
                <div className="st-trailer" />
                <div className="st-wheel st-wheel-front" />
                <div className="st-wheel st-wheel-rear" />
              </div>
            </div>

            {/* Mini progress indicators */}
            <div className="mt-4 space-y-2.5">
              {[
                { label: 'Load match', pct: 92, color: 'bg-cyan-500' },
                { label: 'Route optimal', pct: 78, color: 'bg-orange-500' },
                { label: 'ETA accuracy', pct: 96, color: 'bg-emerald-500' },
              ].map((p) => (
                <div key={p.label} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[10px] text-slate-400">{p.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <motion.div
                      className={`h-full rounded-full ${p.color}`}
                      initial={{ width: '0%' }}
                      animate={{ width: `${p.pct}%` }}
                      transition={{ duration: 1.2, delay: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="w-7 text-right text-[10px] tabular-nums text-slate-500">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
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
      <h1 className="sr-only">{`${card?.label || 'Overview'} Dashboard`}</h1>

      <TruckScene3D
        role={role}
        title={`${card?.label || 'Overview'} Dashboard`}
        description={`Live platform data for your ${card?.label || role} account.`}
      />

      {/* ── KPI Snapshot ──────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mt-8 rounded-[2rem] bg-slate-950/90 p-8 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10 sm:p-10"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-orange-300">{card?.label || 'Dashboard'}</p>
            <h2 className="mt-2 text-3xl font-black text-white">KPI Snapshot</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Live</span>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-orange-300">{error}</p>}

        <div className="mt-8 grid gap-5 lg:grid-cols-3" style={{ perspective: '800px' }}>
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="shimmer-slide relative h-28 animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80" />
              ))
            : metrics.map((metric, i) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.08 }}
                >
                  <StatsCard
                    label={metric.label}
                    value={metric.value}
                    accent={metric.accent}
                    glowColor={i === 0 ? 'cyan' : i === 1 ? 'emerald' : 'orange'}
                  />
                </motion.div>
              ))}
        </div>

        {/* ── Quick Actions + Platform modules ───────────────────── */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-7">
            <h3 className="text-lg font-bold text-white">Quick Actions</h3>
            <div className="mt-5 flex flex-wrap gap-2.5">
              {actions.map((action, i) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + i * 0.06 }}
                >
                  <Link
                    to={action.path}
                    className="block rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-slate-950 shadow-md shadow-orange-500/20 transition hover:bg-orange-400 hover:shadow-orange-400/30"
                  >
                    {action.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </Card3D>

          <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-7">
            <h3 className="text-lg font-bold text-white">Platform Modules</h3>
            <ul className="mt-5 space-y-3">
              {[
                { icon: '📦', text: 'Freight marketplace, escrow & GST billing' },
                { icon: '📍', text: 'Real-time GPS tracking & route optimisation' },
                { icon: '🤖', text: 'AI dispatch, fraud detection and analytics' },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-slate-300">
                  <span className="text-base leading-5 select-none">{item.icon}</span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </Card3D>
        </div>
      </motion.section>
    </main>
  );
}

