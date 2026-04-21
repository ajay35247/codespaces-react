import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';
import { Card3D } from '../components/Card3D';

function LoadCard({ load, onStatusChange, isAssigned }) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  const handleMarkDelivered = async () => {
    if (!window.confirm('Mark this load as delivered?')) return;
    setUpdating(true);
    setError(null);
    try {
      await apiRequest(`/loads/${load.loadId}/status`, { method: 'PATCH', body: { status: 'delivered' } });
      onStatusChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const statusStyles = {
    posted:      'border-sky-500/30 bg-sky-500/10 text-sky-300',
    'in-transit':'border-amber-500/30 bg-amber-500/10 text-amber-300',
    delivered:   'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    cancelled:   'border-slate-600/30 bg-slate-600/10 text-slate-400',
  };
  const statusBadge = statusStyles[load.status] || 'border-slate-600/30 bg-slate-600/10 text-slate-300';

  return (
    <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Load ID</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadge}`}>
              {load.status}
            </span>
          </div>
          <p className="text-lg font-black text-white">{load.loadId}</p>
          <p className="mt-1 text-sm font-medium text-slate-300">
            {load.origin} <span className="text-orange-400 mx-1">→</span> {load.destination}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
            {load.weight   && <span>⚖️ {load.weight}</span>}
            {load.truckType && <span>🚛 {load.truckType}</span>}
            {load.freightPrice && (
              <span className="text-emerald-300 font-semibold">₹{load.freightPrice.toLocaleString('en-IN')}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
            {load.pickupDate && <span>📅 Pickup: {new Date(load.pickupDate).toLocaleDateString('en-IN')}</span>}
            {load.dropDate   && <span>🏁 Drop: {new Date(load.dropDate).toLocaleDateString('en-IN')}</span>}
          </div>
        </div>

        {isAssigned && load.status === 'in-transit' && (
          <button
            onClick={handleMarkDelivered}
            disabled={updating}
            className="shrink-0 self-start rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {updating ? 'Updating…' : '✓ Mark Delivered'}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-xs text-orange-300">{error}</p>}
    </Card3D>
  );
}

export function DriverDashboard() {
  const [myLoads, setMyLoads] = useState([]);
  const [availableLoads, setAvailableLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('assigned');

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiRequest('/loads/mine'),
      apiRequest('/loads/available'),
    ])
      .then(([mineData, availableData]) => {
        setMyLoads(mineData.loads || []);
        setAvailableLoads(availableData.loads || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const inTransit = myLoads.filter((l) => l.status === 'in-transit');
  const delivered  = myLoads.filter((l) => l.status === 'delivered');

  const STAT_TILES = [
    { label: 'In Transit',       value: inTransit.length,     color: 'text-amber-400',   icon: '🚛', glow: 'amber' },
    { label: 'Delivered',        value: delivered.length,      color: 'text-emerald-400', icon: '✅', glow: 'emerald' },
    { label: 'Available Loads',  value: availableLoads.length, color: 'text-cyan-400',    icon: '📦', glow: 'cyan' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950/92 p-8 shadow-2xl ring-1 ring-white/10 sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,0.15),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(56,189,248,0.12),transparent_40%)]" />
        <div className="perspective-grid absolute inset-0 opacity-40" />

        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-slate-300">
              <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
              Driver View
            </div>
            <h1 className="text-4xl font-black text-white">My Trips</h1>
            <p className="mt-3 text-slate-400">View assigned loads, track active trips and mark deliveries.</p>
          </motion.div>
          <button
            onClick={loadData}
            className="self-start rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-slate-300 backdrop-blur-sm transition hover:bg-white/10"
          >
            ↻ Refresh
          </button>
        </div>

        {error && <p className="mt-5 text-sm text-orange-300">{error}</p>}

        {/* Stat tiles */}
        <div className="relative mt-8 grid gap-4 lg:grid-cols-3" style={{ perspective: '800px' }}>
          {STAT_TILES.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.09 }}
            >
              <Card3D className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
                <div className="mb-2 text-2xl leading-none select-none">{s.icon}</div>
                <p className="text-xs uppercase tracking-widest text-slate-500">{s.label}</p>
                <p className={`mt-2 text-3xl font-black tabular-nums ${s.color}`}>
                  {loading ? '—' : s.value}
                </p>
              </Card3D>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Tabs + Load list ── */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 rounded-[2rem] bg-slate-950/90 p-8 shadow-2xl ring-1 ring-white/10 sm:p-10"
      >
        <div className="flex flex-wrap items-center gap-3">
          {['assigned', 'available'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                activeTab === tab
                  ? 'bg-orange-500 text-slate-950 shadow-md shadow-orange-500/25'
                  : 'border border-white/20 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {tab === 'assigned' ? '📋 My Assigned Loads' : '🔍 Available Loads'}
            </button>
          ))}
          <a
            href="/tolls"
            className="ml-auto rounded-full border border-orange-400/40 bg-orange-500/10 px-5 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-500/20"
          >
            ⚡ FASTag &amp; Tolls →
          </a>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            [1, 2].map((i) => (
              <div key={i} className="shimmer-slide relative h-36 animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80" />
            ))
          ) : activeTab === 'assigned' ? (
            myLoads.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-lg font-semibold text-slate-300">No loads assigned yet.</p>
                <p className="mt-2 text-sm text-slate-500">Fleet managers assign loads to drivers. Check the Available Loads tab.</p>
              </div>
            ) : (
              myLoads.map((load, i) => (
                <motion.div key={load.loadId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <LoadCard load={load} onStatusChange={loadData} isAssigned />
                </motion.div>
              ))
            )
          ) : (
            availableLoads.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-lg font-semibold text-slate-300">No available loads at the moment.</p>
                <p className="mt-2 text-sm text-slate-500">Check back later or contact your fleet manager.</p>
              </div>
            ) : (
              availableLoads.map((load, i) => (
                <motion.div key={load.loadId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <LoadCard load={load} onStatusChange={loadData} isAssigned={false} />
                </motion.div>
              ))
            )
          )}
        </div>
      </motion.section>
    </main>
  );
}
