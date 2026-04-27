import { useCallback, useEffect, useState } from 'react';
import { buildApiUrl, getApiErrorMessage, parseApiBody } from '../../utils/api';

const ADMIN_API_SEGMENT = import.meta.env.VITE_ADMIN_API_SEGMENT || import.meta.env.VITE_ADMIN_PRIVATE_PATH_SEGMENT || '';
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function adminApi(path, method = 'GET', body) {
  const csrfHeaders = CSRF_METHODS.has(method.toUpperCase())
    ? { 'X-CSRF-Token': getCsrfToken() }
    : {};
  const res = await fetch(buildApiUrl(`/${ADMIN_API_SEGMENT}${path}`), {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': 'web-control-panel',
      ...csrfHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseApiBody(res);
  if (!res.ok) throw new Error(getApiErrorMessage(data, 'Request failed'));
  return data;
}

const FILTER_FIELDS = [
  { key: 'from', label: 'Origin (From)' },
  { key: 'to', label: 'Destination (To)' },
  { key: 'vehicle', label: 'Vehicle Type' },
  { key: 'loadType', label: 'Load Type' },
  { key: 'price', label: 'Price Range' },
  { key: 'date', label: 'Pickup Date' },
  { key: 'distancePreference', label: 'Route Preference' },
];

const WEIGHT_FIELDS = [
  { key: 'recencyWeight', label: 'Recency', help: 'Boosts fresher posts' },
  { key: 'priceWeight', label: 'Price', help: 'Boosts higher-paying loads' },
  { key: 'proximityWeight', label: 'Proximity', help: 'Reserved — applies once geo is wired' },
  { key: 'sponsorBoost', label: 'Sponsor boost', help: 'Additive boost for pinned load IDs' },
  { key: 'textWeight', label: 'Text relevance', help: 'Multiplier on Mongo $text score' },
];

/**
 * AdminSearchPanel — control-tower view for the universal-search subsystem.
 *
 *   • Tunes ranking weights (recency / price / proximity / sponsor / text)
 *   • Toggles individual filter chips on/off (drives both the public UI and
 *     the backend's filter acceptance)
 *   • Pins / unpins sponsored load IDs
 *   • Surfaces "most searched routes" over the last 7 days
 *
 * All writes go through `/admin/control/search/*`, which is guarded by the
 * existing `verifyJWT + requireAjayAdmin + requireAdminIpWhitelist` chain.
 */
export function AdminSearchPanel() {
  const [config, setConfig] = useState(null);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [newSponsorId, setNewSponsorId] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfgData, trendingData] = await Promise.all([
        adminApi('/control/search/config'),
        adminApi('/control/search/trending?days=7&limit=20'),
      ]);
      setConfig(cfgData.value);
      setTrending(Array.isArray(trendingData.trending) ? trendingData.trending : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (loading || !config) {
    return <p className="mt-6 text-sm text-slate-400">Loading search controls…</p>;
  }

  const update = (patch) => setConfig((prev) => ({ ...prev, ...patch }));
  const updateFilter = (key, value) => setConfig((prev) => ({
    ...prev,
    filters: { ...prev.filters, [key]: value },
  }));

  const save = async () => {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      const data = await adminApi('/control/search/config', 'PUT', config);
      setConfig(data.value);
      setInfo('Saved. Public search will pick up changes within 30 seconds.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addSponsor = async () => {
    const id = newSponsorId.trim();
    if (!id) return;
    setSaving(true);
    setError('');
    try {
      const data = await adminApi('/control/search/sponsored', 'POST', { loadId: id });
      setConfig((prev) => ({ ...prev, sponsoredLoadIds: data.sponsoredLoadIds }));
      setNewSponsorId('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeSponsor = async (id) => {
    setSaving(true);
    setError('');
    try {
      const data = await adminApi(`/control/search/sponsored/${encodeURIComponent(id)}`, 'DELETE');
      setConfig((prev) => ({ ...prev, sponsoredLoadIds: data.sponsoredLoadIds }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Universal Search Controls</h2>
        <p className="mt-1 text-xs text-slate-400">
          Tunes the public `/search` endpoint and admin sponsored placements. Changes take effect within 30s.
        </p>
      </div>

      {error && <p className="rounded-2xl bg-rose-600/20 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {info && <p className="rounded-2xl bg-emerald-600/20 px-4 py-3 text-sm text-emerald-200">{info}</p>}

      {/* Ranking weights */}
      <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <h3 className="text-sm font-semibold">Ranking weights</h3>
        <p className="mt-1 text-xs text-slate-400">Each weight clamps to 0–20.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {WEIGHT_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                <span>{f.label}</span>
                <span className="font-mono text-slate-200">{(config[f.key] ?? 0).toFixed(2)}</span>
              </span>
              <input
                type="range"
                min="0"
                max="20"
                step="0.1"
                value={config[f.key] ?? 0}
                onChange={(e) => update({ [f.key]: parseFloat(e.target.value) })}
                className="mt-1 w-full"
              />
              <span className="text-[11px] text-slate-500">{f.help}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Filter visibility */}
      <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <h3 className="text-sm font-semibold">Filter visibility</h3>
        <p className="mt-1 text-xs text-slate-400">
          When OFF, the corresponding chip is hidden in the public UI and ignored by the backend.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {FILTER_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between rounded-xl bg-slate-950/40 px-3 py-2">
              <span className="text-sm text-slate-200">{f.label}</span>
              <input
                type="checkbox"
                checked={Boolean(config.filters?.[f.key])}
                onChange={(e) => updateFilter(f.key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      {/* Sponsored loads */}
      <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <h3 className="text-sm font-semibold">Sponsored load pins</h3>
        <p className="mt-1 text-xs text-slate-400">Up to 50. These IDs receive `sponsorBoost` on every search.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={newSponsorId}
            onChange={(e) => setNewSponsorId(e.target.value)}
            placeholder="Load ID (e.g. LD-12345)"
            maxLength={64}
            className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={addSponsor}
            disabled={saving || !newSponsorId.trim()}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Pin
          </button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {(config.sponsoredLoadIds || []).map((id) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200 ring-1 ring-amber-400/30"
            >
              <span className="font-mono">{id}</span>
              <button
                type="button"
                onClick={() => removeSponsor(id)}
                aria-label={`Unpin ${id}`}
                className="rounded-full px-1 text-amber-300 hover:text-rose-300"
              >
                ✕
              </button>
            </li>
          ))}
          {(config.sponsoredLoadIds || []).length === 0 && (
            <li className="text-xs text-slate-500">No sponsored loads pinned.</li>
          )}
        </ul>
      </section>

      {/* Most searched routes */}
      <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
        <h3 className="text-sm font-semibold">Most searched routes (last 7 days)</h3>
        {trending.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No search events in this window yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr><th className="py-2 pr-4">Origin</th><th className="pr-4">Destination</th><th className="pr-4">Searches</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {trending.map((r, i) => (
                <tr key={`${r.from}|${r.to}|${i}`} className="border-t border-white/10">
                  <td className="py-2 pr-4">{r.from}</td>
                  <td className="pr-4">{r.to}</td>
                  <td className="pr-4 font-mono">{r.count}</td>
                  <td className="text-xs text-slate-400">{r.lastAt ? new Date(r.lastAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save ranking & filters'}
        </button>
        <button
          type="button"
          onClick={reload}
          disabled={saving}
          className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}

export default AdminSearchPanel;
