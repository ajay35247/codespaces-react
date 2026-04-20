import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

const STATUS_BADGE = {
  posted: 'bg-sky-800 text-sky-200',
  'in-transit': 'bg-amber-800 text-amber-200',
  delivered: 'bg-emerald-800 text-emerald-200',
  cancelled: 'bg-slate-700 text-slate-400',
};

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

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400">Load ID</p>
          <p className="text-lg font-semibold text-white">{load.loadId}</p>
          <p className="mt-1 text-sm text-slate-300">{load.origin} → {load.destination}</p>
          <p className="mt-1 text-xs text-slate-400">Weight: {load.weight} | Type: {load.truckType}</p>
          {load.freightPrice && (
            <p className="mt-1 text-xs text-emerald-300">Freight: ₹{load.freightPrice.toLocaleString('en-IN')}</p>
          )}
          {load.pickupDate && (
            <p className="mt-1 text-xs text-slate-400">Pickup: {new Date(load.pickupDate).toLocaleDateString('en-IN')}</p>
          )}
          {load.dropDate && (
            <p className="mt-1 text-xs text-slate-400">Drop: {new Date(load.dropDate).toLocaleDateString('en-IN')}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_BADGE[load.status] || 'bg-slate-700 text-slate-300'}`}>
            {load.status}
          </span>
          {isAssigned && load.status === 'in-transit' && (
            <button
              onClick={handleMarkDelivered}
              disabled={updating}
              className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {updating ? 'Updating…' : 'Mark Delivered'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-orange-300">{error}</p>}
    </div>
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
  const delivered = myLoads.filter((l) => l.status === 'delivered');

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Driver dashboard</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">My trips</h1>
            <p className="mt-4 text-slate-300">View your assigned loads, track active trips and mark deliveries.</p>
          </div>
          <button
            onClick={loadData}
            className="rounded-full border border-white/20 px-5 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">In transit</p>
            <p className="mt-4 text-3xl font-semibold text-amber-400">{loading ? '—' : inTransit.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Delivered</p>
            <p className="mt-4 text-3xl font-semibold text-emerald-400">{loading ? '—' : delivered.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Available loads</p>
            <p className="mt-4 text-3xl font-semibold text-sky-400">{loading ? '—' : availableLoads.length}</p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          {['assigned', 'available'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${activeTab === tab ? 'bg-orange-500 text-slate-950' : 'border border-white/20 text-slate-300 hover:bg-slate-800'}`}
            >
              {tab === 'assigned' ? 'My Assigned Loads' : 'Available Loads'}
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            [1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-3xl border border-white/10 bg-slate-900/80" />
            ))
          ) : activeTab === 'assigned' ? (
            myLoads.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center text-slate-400">
                <p className="text-lg">No loads assigned to you yet.</p>
                <p className="mt-2 text-sm">Fleet managers assign loads to drivers. Check the Available Loads tab.</p>
              </div>
            ) : (
              myLoads.map((load) => (
                <LoadCard key={load.loadId} load={load} onStatusChange={loadData} isAssigned={true} />
              ))
            )
          ) : (
            availableLoads.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center text-slate-400">
                <p className="text-lg">No available loads at the moment.</p>
                <p className="mt-2 text-sm">Check back later or contact your fleet manager.</p>
              </div>
            ) : (
              availableLoads.map((load) => (
                <LoadCard key={load.loadId} load={load} onStatusChange={loadData} isAssigned={false} />
              ))
            )
          )}
        </div>
      </section>
    </main>
  );
}
