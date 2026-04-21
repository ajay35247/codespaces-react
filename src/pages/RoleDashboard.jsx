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

function TruckScene3D({ title, description }) {
  return (
    <section className="role-hero3d relative overflow-hidden rounded-[2rem] bg-slate-950/90 p-8 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10 sm:p-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(249,115,22,0.14),transparent_40%)]" />

      <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr] [perspective:1200px]">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Dashboard</p>
          <h1 className="mt-3 text-4xl font-semibold text-white">{title}</h1>
          <p className="mt-4 text-slate-300">{description}</p>
        </div>

        <div className="relative mx-auto w-full max-w-xl [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-3xl border border-sky-400/20 bg-sky-500/10 [transform:translateZ(-36px)_rotateX(8deg)_rotateY(-10deg)]" />
          <div className="absolute inset-3 rounded-3xl border border-white/10 bg-slate-900/70 [transform:translateZ(-10px)_rotateX(6deg)_rotateY(-8deg)]" />

          <div className="relative rounded-3xl border border-white/15 bg-slate-950/85 p-5 [transform:translateZ(30px)_rotateX(4deg)_rotateY(-4deg)]">
            <p className="text-xs uppercase tracking-[0.26em] text-slate-300">Live lane</p>
            <div className="role-hero3d-road mt-4 h-24 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90">
              <div className="role-hero3d-road-lines" aria-hidden="true" />
              <div className="role-hero3d-truck" aria-hidden="true">
                <div className="role-hero3d-cabin" />
                <div className="role-hero3d-trailer" />
                <div className="role-hero3d-wheel role-hero3d-wheel-front" />
                <div className="role-hero3d-wheel role-hero3d-wheel-rear" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .role-hero3d {
          --truck-speed: 8s;
        }

        .role-hero3d-road {
          position: relative;
          background-image: linear-gradient(to bottom, rgba(15, 23, 42, 0.5), rgba(2, 6, 23, 0.9));
        }

        .role-hero3d-road-lines {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            90deg,
            transparent 0 16px,
            rgba(226, 232, 240, 0.35) 16px 26px
          );
          animation: roleHeroRoadMove 1.15s linear infinite;
          mask-image: linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%);
        }

        .role-hero3d-truck {
          position: absolute;
          left: -15%;
          bottom: 10px;
          width: 122px;
          height: 42px;
          animation: roleHeroTruckRun var(--truck-speed) linear infinite;
          filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.5));
        }

        .role-hero3d-cabin {
          position: absolute;
          left: 0;
          bottom: 10px;
          width: 34px;
          height: 20px;
          border-radius: 8px 5px 5px 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: linear-gradient(130deg, rgba(251, 146, 60, 0.95), rgba(251, 146, 60, 0.55));
        }

        .role-hero3d-trailer {
          position: absolute;
          left: 30px;
          bottom: 8px;
          width: 86px;
          height: 24px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: linear-gradient(130deg, rgba(56, 189, 248, 0.35), rgba(59, 130, 246, 0.14));
        }

        .role-hero3d-wheel {
          position: absolute;
          bottom: 0;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: radial-gradient(circle at 35% 35%, rgba(248, 250, 252, 0.38), rgba(15, 23, 42, 0.8));
          animation: roleHeroWheelSpin 0.62s linear infinite;
        }

        .role-hero3d-wheel-front {
          left: 8px;
        }

        .role-hero3d-wheel-rear {
          left: 82px;
        }

        @keyframes roleHeroRoadMove {
          from { transform: translateX(0); }
          to { transform: translateX(-42px); }
        }

        @keyframes roleHeroTruckRun {
          from { transform: translateX(0) translateY(0); }
          50% { transform: translateX(95%) translateY(-1px); }
          to { transform: translateX(145%) translateY(0); }
        }

        @keyframes roleHeroWheelSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .role-hero3d-road-lines,
          .role-hero3d-truck,
          .role-hero3d-wheel {
            animation: none !important;
          }
        }
      `}</style>
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
      <TruckScene3D
        title={`${card?.label || 'Overview'} Dashboard`}
        description={`Live platform data for your ${card?.label || role} account.`}
      />

      <section className="mt-8 rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">{card?.label || 'Dashboard'}</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">KPI Snapshot</h2>
        <p className="mt-4 text-slate-300">Role-specific metrics and modules.</p>

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
