import { MetricCard, PageHeader } from './AdminShell';

/**
 * MissionControl — the new "Dashboard" landing view.
 *
 * Stateless presentational component fed by the parent's already-loaded
 * data (users / revenue / loads / supportTickets / gstInvoices / analytics
 * / featureFlags / offers / auditLogs).  No new API calls — keeps initial
 * dashboard render under the parent's existing single batched fetch and
 * avoids waterfalls.
 */

const EMPTY_REVENUE_BARS = Array.from({ length: 14 }, () => 0);

function formatInr(n) {
  return `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function MissionControl({
  users = [],
  revenue,
  loads = [],
  supportTickets = [],
  analytics,
  offers = [],
  auditLogs = [],
  featureFlags = {},
  onQuickAction,
}) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const activeUsers = users.filter((u) => u.status === 'active' || !u.status).length;
  const last24hPayments = (analytics?.payments24h ?? null);
  const todaysRevenue = revenue?.payments?.success ?? 0;
  const subscriptionRevenue = revenue?.subscriptionRevenue ?? 0;
  const openTickets = supportTickets.filter((t) => t.status === 'open').length;
  const activeLoads = loads.filter((l) => l.status === 'open' || l.status === 'in-transit').length;
  const liveOffers = offers.filter((o) => {
    const startsOk = new Date(o.startsAt).getTime() <= now;
    const endsOk = new Date(o.endsAt).getTime() > now;
    return o.enabled && startsOk && endsOk;
  }).length;

  const recentActivity = auditLogs.slice(0, 12);

  return (
    <div>
      <PageHeader
        title="Mission Control"
        subtitle="Live snapshot of platform health, revenue, and the most recent admin activity."
        actions={(
          <>
            <button
              type="button"
              onClick={() => onQuickAction?.('start-sale')}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-300"
            >
              Start Sale
            </button>
            <button
              type="button"
              onClick={() => onQuickAction?.('stop-all')}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-semibold text-slate-50 hover:bg-rose-400"
            >
              Stop All Offers
            </button>
            <button
              type="button"
              onClick={() => onQuickAction?.('send-notification')}
              className="rounded-lg border border-current/20 px-3 py-1.5 text-sm font-medium hover:bg-current/[0.05]"
            >
              Send Notification
            </button>
          </>
        )}
      />

      {/* Row 1 — Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Today's revenue" value={formatInr(todaysRevenue)} />
        <MetricCard label="Subscription revenue" value={formatInr(subscriptionRevenue)} />
        <MetricCard label="Active users" value={activeUsers} />
        <MetricCard
          label="Platform status"
          value={featureFlags.maintenanceMode ? '🔴 Maintenance' : '🟢 Online'}
          intent={featureFlags.maintenanceMode ? 'down' : 'up'}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Active loads" value={activeLoads} />
        <MetricCard label="Open tickets" value={openTickets} />
        <MetricCard label="Live offers" value={liveOffers} />
        <MetricCard
          label="Open fraud alerts"
          value={analytics?.openFraudAlerts ?? '—'}
          intent={(analytics?.openFraudAlerts || 0) > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Row 2 — Revenue trend (placeholder, real chart in Phase 3) + Live feed */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-current/10 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70">Revenue snapshot</h2>
            <span className="text-xs opacity-60">last 24h: {last24hPayments != null ? formatInr(last24hPayments) : '—'}</span>
          </div>
          <div className="mt-3 flex h-40 items-end gap-1">
            {/* Lightweight bar viz — real time-series chart lands in Phase 3 (Recharts) */}
            {(analytics?.dailyRevenue || EMPTY_REVENUE_BARS).slice(-14).map((v, i) => {
              const max = Math.max(...((analytics?.dailyRevenue || [1])), 1);
              const h = `${Math.max(4, Math.round((v / max) * 100))}%`;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-cyan-500/60"
                  style={{ height: h }}
                  title={formatInr(v)}
                />
              );
            })}
          </div>
          <p className="mt-3 text-xs opacity-60">
            Lightweight preview. A full time-series chart lands in Phase 3 (Recharts).
          </p>
        </div>

        <div className="rounded-xl border border-current/10 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-70">Live activity</h2>
          <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">
            {recentActivity.length === 0 && <li className="opacity-60">No recent admin activity.</li>}
            {recentActivity.map((log) => (
              <li key={log._id} className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs opacity-90 truncate">{log.action}</span>
                <span className="text-[11px] opacity-60 whitespace-nowrap">{timeAgo(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
