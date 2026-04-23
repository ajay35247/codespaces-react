import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';

const INSIGHT_COLORS = {
  warning: { bg: 'bg-amber-500/8',  border: 'border-amber-500/20',  icon: '⚠️', text: 'text-amber-300' },
  success: { bg: 'bg-emerald-500/8',border: 'border-emerald-500/20',icon: '✅', text: 'text-emerald-300' },
  info:    { bg: 'bg-sky-500/8',    border: 'border-sky-500/20',    icon: '💡', text: 'text-sky-300' },
  danger:  { bg: 'bg-rose-500/8',   border: 'border-rose-500/20',   icon: '🚨', text: 'text-rose-300' },
};

function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}

/**
 * Derive human-readable, money-focused insights from dashboard stats.
 * These replace generic charts with concrete "you lost / can earn" statements.
 */
function generateInsights(role, stats) {
  const insights = [];
  if (!stats) return insights;

  if (role === 'driver') {
    const perf = Number(stats.performanceScore) || 0;
    if (perf > 0 && perf < 70) {
      insights.push({
        type: 'warning',
        title: `Performance score: ${stats.performanceScore}`,
        body: 'Low score means fewer premium loads. Complete more trips to improve your rating.',
        action: 'Browse loads', href: '/driver',
      });
    } else if (perf >= 90) {
      insights.push({
        type: 'success',
        title: `Excellent score: ${stats.performanceScore}/100`,
        body: 'You're eligible for premium, high-value loads — keep it up!',
        action: null,
      });
    }
    if (Number(stats.earnings) > 0) {
      insights.push({
        type: 'info',
        title: `You've earned ₹${fmt(stats.earnings)} this period`,
        body: 'Complete more deliveries to push toward your monthly target.',
        action: 'Find loads', href: '/driver',
      });
    }
    if (Number(stats.inTransit) === 0 && Number(stats.delivered) === 0) {
      insights.push({
        type: 'info',
        title: 'No active trips — idle time costs you money',
        body: 'Available loads are waiting for bids. Don't let them go to competitors.',
        action: 'Browse loads', href: '/driver',
      });
    }
  }

  if (role === 'shipper') {
    const rate = Number(stats.onTimeDelivery) || 0;
    if (rate > 0 && rate < 80) {
      insights.push({
        type: 'warning',
        title: `On-time delivery: ${stats.onTimeDelivery}%`,
        body: 'Low on-time rate may indicate driver quality issues. Review ratings before accepting bids.',
        action: 'My loads', href: '/shipper',
      });
    }
    if (Number(stats.activeLoads) > 5) {
      insights.push({
        type: 'info',
        title: `${stats.activeLoads} loads need monitoring`,
        body: 'Several loads may have pending bids awaiting your decision.',
        action: 'Review loads', href: '/shipper',
      });
    }
    if (Number(stats.totalFreight) > 0) {
      insights.push({
        type: 'success',
        title: `₹${fmt(stats.totalFreight)} of freight posted`,
        body: 'Your loads are getting competitive bids from verified carriers.',
        action: null,
      });
    }
    if (!stats.activeLoads) {
      insights.push({
        type: 'info',
        title: 'Post a load to get bids instantly',
        body: 'Hundreds of verified drivers are available right now.',
        action: 'Post load', href: '/shipper',
      });
    }
  }

  if (role === 'broker') {
    if (Number(stats.pendingBids) > 0) {
      insights.push({
        type: 'info',
        title: `${stats.pendingBids} bid${stats.pendingBids !== 1 ? 's' : ''} awaiting response`,
        body: 'Follow up with shippers to improve your conversion rate and close more deals.',
        action: 'Deal pipeline', href: '/broker',
      });
    }
    if (Number(stats.commission) > 0) {
      insights.push({
        type: 'success',
        title: `₹${fmt(stats.commission)} commission earned`,
        body: 'Keep your bid acceptance rate high to access exclusive priority loads.',
        action: null,
      });
    }
    if (!stats.openBids && !stats.pendingBids) {
      insights.push({
        type: 'info',
        title: 'No active deals — find loads to bid on',
        body: 'Browse the marketplace to start earning commissions today.',
        action: 'Browse loads', href: '/broker',
      });
    }
  }

  if (role === 'truck_owner') {
    insights.push({
      type: 'info',
      title: 'Keep your fleet moving to recover EMI costs',
      body: 'Idle trucks mean lost revenue. Assign drivers to available loads now.',
      action: 'Fleet dashboard', href: '/truck-owner',
    });
    if (Number(stats.totalVehicles) > 0 && Number(stats.activeLoads) === 0) {
      insights.push({
        type: 'warning',
        title: 'All vehicles appear idle',
        body: 'No active loads detected. Consider assigning drivers or posting availability.',
        action: 'View fleet', href: '/truck-owner',
      });
    }
  }

  return insights.slice(0, 4);
}

/**
 * AnalyticsInsights
 *
 * Replaces boring charts with actionable, money-focused insight cards.
 * Every card has a direct CTA so the user can act immediately.
 */
export function AnalyticsInsights() {
  const user = useSelector((s) => s.auth.user);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    apiRequest('/dashboard/stats')
      .then((d) => setStats(d.stats || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  const insights = generateInsights(user?.role, stats);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="shimmer-slide relative h-14 rounded-2xl bg-slate-800 overflow-hidden animate-pulse" />
        ))}
      </div>
    );
  }

  if (!insights.length) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      <div className="mb-5">
        <p className="text-[10px] uppercase tracking-[0.3em] text-violet-300">Smart Analytics</p>
        <h3 className="mt-1 text-base font-bold text-white">Actionable Insights</h3>
        <p className="mt-1 text-xs text-slate-500">Real decisions, real outcomes — no fluff.</p>
      </div>

      <div className="space-y-3">
        {insights.map((insight, i) => {
          const c = INSIGHT_COLORS[insight.type] || INSIGHT_COLORS.info;
          return (
            <motion.div
              key={insight.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`rounded-2xl border ${c.border} ${c.bg} p-3.5`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5 shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${c.text}`}>{insight.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">{insight.body}</p>
                  {insight.action && insight.href && (
                    <a
                      href={insight.href}
                      className="mt-1.5 inline-block text-[11px] font-semibold text-white/60 hover:text-white transition underline underline-offset-2"
                    >
                      {insight.action} →
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
