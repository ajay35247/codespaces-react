import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';

/**
 * Role-specific suggested actions that the user can take with one click.
 *
 * The suggestions are generated locally based on the dashboard stats API
 * response.  No AI backend is required — the logic is simple heuristics that
 * map directly to real money/time outcomes for each role.
 */
const ROLE_PRIORITY = {
  shipper: (stats) => [
    stats?.activeLoads > 0 && {
      icon: '🚛', color: 'text-amber-400', border: 'border-amber-500/20',
      title: `${stats.activeLoads} load${stats.activeLoads !== 1 ? 's' : ''} in progress`,
      subtitle: 'Monitor in-transit shipments',
      action: 'View Loads', href: '/shipper',
    },
    {
      icon: '📦', color: 'text-sky-400', border: 'border-sky-500/20',
      title: 'Post a new load',
      subtitle: 'Get instant bids from carriers',
      action: 'Post Load', href: '/shipper',
    },
    {
      icon: '🧾', color: 'text-emerald-400', border: 'border-emerald-500/20',
      title: 'GST invoicing',
      subtitle: 'Create & download invoices',
      action: 'Open', href: '/gst',
    },
    {
      icon: '💳', color: 'text-violet-400', border: 'border-violet-500/20',
      title: 'Wallet & payouts',
      subtitle: 'Check balance & transactions',
      action: 'Wallet', href: '/wallet',
    },
  ].filter(Boolean),

  driver: (stats) => [
    stats?.inTransit > 0 && {
      icon: '🚀', color: 'text-amber-400', border: 'border-amber-500/20',
      title: `${stats.inTransit} trip${stats.inTransit !== 1 ? 's' : ''} in transit`,
      subtitle: 'Update status or submit POD',
      action: 'My Trips', href: '/driver',
    },
    {
      icon: '🔍', color: 'text-cyan-400', border: 'border-cyan-500/20',
      title: 'Find available loads',
      subtitle: 'Browse & bid on open loads',
      action: 'Browse', href: '/driver',
    },
    {
      icon: '📍', color: 'text-emerald-400', border: 'border-emerald-500/20',
      title: 'Share GPS location',
      subtitle: 'Let shippers track you live',
      action: 'Go Live', href: '/driver/live',
    },
    {
      icon: '⚡', color: 'text-orange-400', border: 'border-orange-500/20',
      title: 'FASTag & tolls',
      subtitle: 'Check balance & recharge',
      action: 'Open', href: '/tolls',
    },
  ].filter(Boolean),

  broker: (stats) => [
    stats?.openBids > 0 && {
      icon: '💼', color: 'text-sky-400', border: 'border-sky-500/20',
      title: `${stats.openBids} load${stats.openBids !== 1 ? 's' : ''} to bid on`,
      subtitle: 'Submit competitive bids',
      action: 'Bid Now', href: '/broker',
    },
    stats?.pendingBids > 0 && {
      icon: '⏳', color: 'text-amber-400', border: 'border-amber-500/20',
      title: `${stats.pendingBids} bid${stats.pendingBids !== 1 ? 's' : ''} awaiting response`,
      subtitle: 'Follow up to close deals faster',
      action: 'Pipeline', href: '/broker',
    },
    {
      icon: '🤝', color: 'text-emerald-400', border: 'border-emerald-500/20',
      title: 'Browse marketplace',
      subtitle: 'Find new loads to negotiate',
      action: 'Browse', href: '/broker',
    },
    {
      icon: '💳', color: 'text-violet-400', border: 'border-violet-500/20',
      title: 'Commission tracking',
      subtitle: 'View earnings & wallet balance',
      action: 'Wallet', href: '/wallet',
    },
  ].filter(Boolean),

  truck_owner: () => [
    {
      icon: '🚛', color: 'text-violet-400', border: 'border-violet-500/20',
      title: 'Fleet overview',
      subtitle: 'Manage vehicles & assign drivers',
      action: 'Fleet', href: '/truck-owner',
    },
    {
      icon: '🗺️', color: 'text-sky-400', border: 'border-sky-500/20',
      title: 'Live fleet tracking',
      subtitle: 'Track all vehicles in real time',
      action: 'Track', href: '/tracking',
    },
    {
      icon: '💳', color: 'text-emerald-400', border: 'border-emerald-500/20',
      title: 'Wallet & payouts',
      subtitle: 'View earnings & transactions',
      action: 'Wallet', href: '/wallet',
    },
    {
      icon: '🔐', color: 'text-amber-400', border: 'border-amber-500/20',
      title: 'KYC verification',
      subtitle: 'Boost trust score & unlock loads',
      action: 'KYC', href: '/kyc',
    },
  ],
};

/**
 * SmartDecisionWidget
 *
 * Displays role-specific one-click action cards.  In compact mode (used inside
 * the LiveActivityRail) only icons + short labels are shown.
 *
 * Props:
 *   compact – render smaller cards for the rail's action tab (default: false)
 */
export function SmartDecisionWidget({ compact = false }) {
  const user = useSelector((s) => s.auth.user);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    apiRequest('/dashboard/stats')
      .then((data) => setStats(data.stats || null))
      .catch(() => {});
  }, [user?.id]);

  const role = user?.role;
  const getPriorities = ROLE_PRIORITY[role] || (() => []);
  const priorities = getPriorities(stats).slice(0, compact ? 4 : 8);

  if (!priorities.length) return null;

  return (
    <div>
      {!compact && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-[0.3em] text-orange-300">Smart Engine</p>
          <h3 className="mt-1 text-base font-bold text-white">Today's Priorities</h3>
          <p className="mt-1 text-xs text-slate-500">One-click actions to save time and increase earnings.</p>
        </div>
      )}
      {compact && (
        <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-orange-300">Suggested Actions</p>
      )}

      <div className="space-y-2">
        {priorities.map((p, i) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <Link
              to={p.href}
              className={`flex items-center gap-3 rounded-2xl border ${p.border} bg-white/3 p-3 transition hover:bg-white/6 group`}
            >
              <span className="text-xl leading-none shrink-0">{p.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold ${p.color} truncate`}>{p.title}</p>
                {!compact && p.subtitle && (
                  <p className="mt-0.5 text-[10px] text-slate-500 truncate">{p.subtitle}</p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400 group-hover:text-white transition whitespace-nowrap">
                {p.action}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
