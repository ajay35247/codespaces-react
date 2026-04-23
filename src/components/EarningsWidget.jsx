import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';

/** Animated SVG ring that fills to `value/max`. */
function ProgressRing({ value, max, size = 84, stroke = 8, color = '#f97316' }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, max > 0 ? value / max : 0));
  const offset = circumference * (1 - pct);
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

/** Single horizontal bar row for activity breakdown. */
function Bar({ label, value, max, colorClass }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[10px] text-slate-500 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${colorClass}`}
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </div>
      <span className="w-12 text-right text-[10px] tabular-nums text-slate-400">{value}</span>
    </div>
  );
}

/**
 * EarningsWidget
 *
 * Shows an animated progress ring (earnings vs monthly target), wallet balance,
 * and a role-specific activity breakdown using animated bar charts.
 */
export function EarningsWidget() {
  const user = useSelector((s) => s.auth.user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    const role = user.role;
    const walletRoles = ['shipper', 'driver', 'broker'];
    Promise.all([
      apiRequest('/dashboard/stats'),
      walletRoles.includes(role) ? apiRequest('/wallet').catch(() => null) : Promise.resolve(null),
    ])
      .then(([statsRes, walletRes]) => {
        setData({ stats: statsRes?.stats || null, wallet: walletRes?.wallet || null });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const role = user?.role;
  const stats = data?.stats;
  const walletBal = data?.wallet?.balance ?? null;

  // Role-specific earnings field from dashboard stats.
  const earnings =
    stats?.earnings ?? stats?.totalFreight ?? stats?.commission ?? 0;

  // Monthly earning target — intentionally ambitious to motivate action.
  const MONTHLY_TARGET = {
    driver:      80000,
    shipper:    500000,
    broker:     200000,
    truck_owner:300000,
  };
  const monthlyTarget = MONTHLY_TARGET[role] ?? 100000;
  // Guard against accidental zero so the ring percentage stays finite.
  const safeTarget = monthlyTarget > 0 ? monthlyTarget : 1;

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 space-y-4">
        <div className="shimmer-slide relative h-4 w-36 rounded-full bg-slate-800 overflow-hidden" />
        <div className="flex items-center gap-6">
          <div className="shimmer-slide relative h-[84px] w-[84px] rounded-full bg-slate-800 overflow-hidden" />
          <div className="space-y-2 flex-1">
            <div className="shimmer-slide relative h-3 w-24 rounded-full bg-slate-800 overflow-hidden" />
            <div className="shimmer-slide relative h-5 w-32 rounded-full bg-slate-800 overflow-hidden" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-300">Earnings Engine</p>
          <h3 className="mt-1 text-base font-bold text-white">Financial Overview</h3>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/8 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 whitespace-nowrap">
          Live
        </span>
      </div>

      <div className="flex items-center gap-6">
        {/* Animated progress ring */}
        <div className="relative shrink-0">
          <ProgressRing value={earnings} max={safeTarget} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] text-slate-500">of goal</span>
            <span className="text-xs font-black text-white tabular-nums">
              {Math.round((earnings / safeTarget) * 100)}%
            </span>
          </div>
        </div>

        {/* Key figures */}
        <div className="flex-1 space-y-2.5">
          <div>
            <p className="text-[10px] text-slate-500">Total Earnings</p>
            <p className="text-lg font-black text-emerald-400 tabular-nums leading-tight">
              ₹{Number(earnings).toLocaleString('en-IN')}
            </p>
          </div>
          {walletBal !== null && (
            <div>
              <p className="text-[10px] text-slate-500">Wallet Balance</p>
              <p className="text-base font-bold text-sky-400 tabular-nums leading-tight">
                ₹{Number(walletBal).toLocaleString('en-IN')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Role-specific activity breakdown */}
      {stats && (
        <div className="mt-5 space-y-2.5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-3">Activity</p>

          {role === 'driver' && (
            <>
              <Bar label="In Transit" value={stats.inTransit ?? 0}  max={10} colorClass="bg-amber-500" />
              <Bar label="Delivered"  value={stats.delivered  ?? 0}  max={20} colorClass="bg-emerald-500" />
            </>
          )}

          {role === 'shipper' && (
            <>
              <Bar label="Active"    value={stats.activeLoads ?? 0} max={20} colorClass="bg-sky-500" />
              <Bar label="Delivered" value={stats.delivered   ?? 0} max={50} colorClass="bg-emerald-500" />
            </>
          )}

          {role === 'broker' && (
            <>
              <Bar label="Open Bids"  value={stats.openBids  ?? 0} max={50} colorClass="bg-sky-500" />
              <Bar label="Contracts"  value={stats.contracts ?? 0} max={20} colorClass="bg-emerald-500" />
            </>
          )}

          {role === 'truck_owner' && (
            <>
              <Bar label="Fleet Size"  value={stats.totalVehicles ?? 0} max={20} colorClass="bg-violet-500" />
              <Bar label="Active Jobs" value={stats.activeLoads   ?? 0} max={20} colorClass="bg-emerald-500" />
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-between items-center">
        <p className="text-[10px] text-slate-600">
          Monthly target: ₹{Number(safeTarget).toLocaleString('en-IN')}
        </p>
        <a href="/wallet" className="text-[11px] text-slate-500 hover:text-slate-300 transition">
          Wallet →
        </a>
      </div>
    </div>
  );
}
