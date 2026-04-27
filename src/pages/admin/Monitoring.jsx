import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, apiRequest } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';

const ADMIN_API_SEGMENT = (
  import.meta.env.VITE_ADMIN_API_SEGMENT ||
  import.meta.env.VITE_ADMIN_PRIVATE_PATH_SEGMENT ||
  ''
).toString().replace(/^\//, '').replace(/\/$/, '');

const TABS = [
  { key: 'errors', label: 'Errors' },
  { key: 'health', label: 'Health' },
  { key: 'healing', label: 'Self-Heal Rules' },
];

function adminPath(suffix) {
  // Backend mounts adminMonitoring under `/api/<segment>/monitoring`.
  // VITE_ADMIN_API_SEGMENT must mirror VITE_ADMIN_PRIVATE_PATH_SEGMENT.
  return `/${ADMIN_API_SEGMENT}/monitoring${suffix}`;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const SEVERITY_COLOR = {
  fatal: 'bg-red-500/20 text-red-300 border-red-500/30',
  error: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  warning: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30',
  info: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
};

function ErrorsTab() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [filterStatus, setFilterStatus] = useState('open');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [page] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (filterStatus) qs.set('status', filterStatus);
      if (filterSeverity) qs.set('severity', filterSeverity);
      qs.set('page', String(page));
      qs.set('pageSize', '50');
      const data = await apiFetch(`${adminPath('/errors')}?${qs.toString()}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message || 'Failed to load errors');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, page]);

  useEffect(() => { load(); }, [load]);

  // Live updates from backend.
  useSocket('admin:monitoring', () => {
    // Throttle ourselves at most once per 5s — the backend can fire frequently.
    if (!load.__throttle || Date.now() - load.__throttle > 5000) {
      load.__throttle = Date.now();
      load();
    }
  });

  const updateStatus = useCallback(async (fingerprint, status) => {
    try {
      await apiRequest(adminPath(`/errors/${fingerprint}`), { method: 'PATCH', body: { status } });
      load();
    } catch (e) {
      setError(e.message || 'Failed to update');
    }
  }, [load]);

  const openDetail = useCallback(async (fingerprint) => {
    try {
      const data = await apiFetch(adminPath(`/errors/${fingerprint}`));
      setSelected(data.event);
    } catch (e) {
      setError(e.message || 'Failed to load detail');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="auto_healed">Auto-healed</option>
          <option value="resolved">Resolved</option>
          <option value="silenced">Silenced</option>
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <span className="text-xs text-slate-400">
          {loading ? 'Loading…' : `${items.length} of ${total}`}
        </span>
        <button
          onClick={load}
          className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {error ? <div className="text-red-300 text-sm">{error}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3">Route</th>
              <th className="text-right px-4 py-3">Count</th>
              <th className="text-right px-4 py-3">Last seen</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.fingerprint} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] border ${SEVERITY_COLOR[e.severity] || ''}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="px-4 py-2 max-w-[28rem] truncate" title={e.message}>
                  <button onClick={() => openDetail(e.fingerprint)} className="text-orange-300 hover:underline text-left">
                    {e.message || '(no message)'}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-400">{e.route || '—'}</td>
                <td className="px-4 py-2 text-right">{e.count}</td>
                <td className="px-4 py-2 text-right text-slate-400">{timeAgo(e.lastSeen)}</td>
                <td className="px-4 py-2 text-slate-300">{e.status}</td>
                <td className="px-4 py-2 text-right">
                  {e.status !== 'resolved' && (
                    <button
                      onClick={() => updateStatus(e.fingerprint, 'resolved')}
                      className="text-xs text-slate-300 hover:text-white"
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No matching errors</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <DetailDrawer event={selected} onClose={() => setSelected(null)} onUpdate={updateStatus} />
      )}
    </div>
  );
}

function DetailDrawer({ event, onClose, onUpdate }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/80 flex justify-end" onClick={onClose}>
      <div
        className="w-[42rem] max-w-full h-full bg-slate-900 border-l border-white/10 p-6 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-orange-300">{event.message || '(no message)'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="text-xs text-slate-400 mb-4">
          fingerprint: <code>{event.fingerprint}</code> • route: {event.route || '—'} • count: {event.count}
        </div>
        <div className="flex gap-2 mb-4">
          {['open', 'auto_healed', 'resolved', 'silenced'].map((s) => (
            <button
              key={s}
              onClick={() => onUpdate(event.fingerprint, s)}
              className={`px-3 py-1.5 rounded-full text-xs border ${event.status === s ? 'bg-orange-500/20 text-orange-200 border-orange-400/40' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <details open className="mb-4">
          <summary className="text-sm text-slate-300 cursor-pointer">Stack trace</summary>
          <pre className="mt-2 text-xs text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 p-3 rounded-lg border border-white/5">
            {event.stack || '(none)'}
          </pre>
        </details>
        {event.componentStack && (
          <details className="mb-4">
            <summary className="text-sm text-slate-300 cursor-pointer">Component stack</summary>
            <pre className="mt-2 text-xs text-slate-300 whitespace-pre-wrap break-words bg-slate-950/60 p-3 rounded-lg border border-white/5">
              {event.componentStack}
            </pre>
          </details>
        )}
        {Array.isArray(event.breadcrumbs) && event.breadcrumbs.length > 0 && (
          <details>
            <summary className="text-sm text-slate-300 cursor-pointer">Breadcrumbs ({event.breadcrumbs.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-400">
              {event.breadcrumbs.map((c, i) => (
                <li key={i}>
                  <span className="text-slate-500">[{new Date(c.t).toLocaleTimeString()}] </span>
                  <span className="text-slate-300">{c.kind}</span>: {c.data}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function HealthTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const out = await apiFetch(adminPath('/health'));
      setData(out);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const forceReload = useCallback(async () => {
    if (!confirm('Force all connected clients to reload?')) return;
    try {
      await apiRequest(adminPath('/force-reload'), { method: 'POST' });
    } catch (e) {
      setError(e.message || 'Failed to force-reload');
    }
  }, []);

  if (error) return <div className="text-red-300 text-sm">{error}</div>;
  if (!data) return <div className="text-slate-400 text-sm">Loading…</div>;

  const cards = [
    { label: 'Uptime', value: `${Math.round(data.uptimeSec / 60)} min` },
    { label: 'Memory (RSS)', value: `${data.memoryMb} MB` },
    { label: 'Load avg (1m)', value: data.loadAvg1?.toFixed(2) ?? '—' },
    { label: 'Mongo', value: data.mongo?.ok ? 'connected' : `state=${data.mongo?.state}` },
    { label: 'Redis', value: data.redis?.ok ? 'connected' : 'disconnected' },
    { label: 'Errors / 1h', value: data.errors?.lastHour ?? 0 },
    { label: 'Errors / 24h', value: data.errors?.last24h ?? 0 },
    { label: 'Open fingerprints', value: data.errors?.openFingerprints ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={forceReload} className="rounded-lg bg-red-500/20 border border-red-400/30 px-3 py-2 text-sm text-red-200 hover:bg-red-500/30">
          Force-reload all clients
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">{c.label}</div>
            <div className="text-2xl font-semibold text-white mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
        <div className="text-sm text-slate-300 mb-2">Outbound circuit breakers</div>
        {(data.breakers || []).length === 0 ? (
          <div className="text-xs text-slate-500">No registered breakers yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-500"><tr><th className="text-left py-1">Name</th><th>State</th><th>Failures</th><th>Successes</th><th>Short-circuits</th></tr></thead>
            <tbody>
              {data.breakers.map((b) => (
                <tr key={b.name} className="border-t border-white/5">
                  <td className="py-1 text-slate-200">{b.name}</td>
                  <td className="text-center">{b.state}</td>
                  <td className="text-center">{b.totalFailures}</td>
                  <td className="text-center">{b.successes}</td>
                  <td className="text-center">{b.shortCircuits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function HealingRulesTab() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ name: '', action: 'reload_route', fingerprintMatch: '' });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(adminPath('/healing-rules'));
      setItems(data.items || []);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to load');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = useCallback(async () => {
    if (!draft.name) { setError('Name required'); return; }
    try {
      await apiRequest(adminPath('/healing-rules'), { method: 'POST', body: draft });
      setDraft({ name: '', action: 'reload_route', fingerprintMatch: '' });
      load();
    } catch (e) {
      setError(e.message || 'Failed to create');
    }
  }, [draft, load]);

  const remove = useCallback(async (id) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await apiRequest(adminPath(`/healing-rules/${id}`), { method: 'DELETE' });
      load();
    } catch (e) {
      setError(e.message || 'Failed to delete');
    }
  }, [load]);

  return (
    <div className="space-y-4">
      {error ? <div className="text-red-300 text-sm">{error}</div> : null}

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
        <div className="text-sm text-slate-300">New rule</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name"
            className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={draft.action}
            onChange={(e) => setDraft({ ...draft, action: e.target.value })}
            className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
          >
            <option value="reload_route">reload_route</option>
            <option value="clear_cache_key">clear_cache_key</option>
            <option value="kill_switch_flag">kill_switch_flag (suggest)</option>
            <option value="rollback_release">rollback_release</option>
            <option value="soft_restart">soft_restart</option>
          </select>
          <input
            value={draft.fingerprintMatch}
            onChange={(e) => setDraft({ ...draft, fingerprintMatch: e.target.value })}
            placeholder="fingerprint (optional)"
            className="bg-slate-950/60 border border-white/10 rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            className="rounded-lg bg-orange-500 text-slate-950 px-3 py-2 text-sm font-semibold hover:bg-orange-400"
          >
            Create
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-slate-400">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Fingerprint</th>
              <th className="text-left px-4 py-3">Enabled</th>
              <th className="text-right px-4 py-3">Applied</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r._id} className="border-t border-white/5">
                <td className="px-4 py-2 text-slate-200">{r.name}</td>
                <td className="px-4 py-2 text-slate-300">{r.action}</td>
                <td className="px-4 py-2 text-slate-500"><code>{r.fingerprintMatch || '—'}</code></td>
                <td className="px-4 py-2">{r.enabled ? 'yes' : 'no'}</td>
                <td className="px-4 py-2 text-right">{r.appliedCount || 0}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => remove(r._id)} className="text-xs text-red-300 hover:text-red-200">Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No rules defined</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [tab, setTab] = useState('errors');
  const TabComp = useMemo(() => {
    if (tab === 'health') return <HealthTab />;
    if (tab === 'healing') return <HealingRulesTab />;
    return <ErrorsTab />;
  }, [tab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-orange-300">Monitoring</h1>
          <p className="text-sm text-slate-400">Errors, health, and self-healing rules</p>
        </div>
      </header>
      <nav className="flex gap-2 mb-6 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${tab === t.key ? 'border-orange-400 text-orange-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {TabComp}
    </div>
  );
}
