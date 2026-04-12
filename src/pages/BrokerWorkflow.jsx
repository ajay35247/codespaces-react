import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const brokerTasks = [
  { title: 'Match loads', description: 'Review open bids and assign trucks to high-priority shipments.', status: 'Active' },
  { title: 'Negotiate rates', description: 'Update freight offers and track commission performance.', status: 'Pending' },
  { title: 'Review contracts', description: 'Validate logistics agreements and payment terms.', status: 'Completed' },
];

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export function BrokerWorkflow() {
  const token = useSelector((state) => state.auth.token);
  const role = useSelector((state) => state.auth.role);
  const [summary, setSummary] = useState(null);
  const [loads, setLoads] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;

    Promise.all([
      fetch(`${API_URL}/api/broker/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-role': role,
        },
      }).then((res) => res.json()),
      fetch(`${API_URL}/api/broker/loads`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-role': role,
        },
      }).then((res) => res.json()),
    ])
      .then(([summaryData, loadsData]) => {
        if (summaryData.error) throw new Error(summaryData.error);
        if (loadsData.error) throw new Error(loadsData.error);
        setSummary(summaryData.brokerSummary || null);
        setLoads(loadsData.loads || []);
      })
      .catch((err) => setError(err.message));
  }, [token, role]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Broker management</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Broker workflow dashboard</h1>
        <p className="mt-4 text-slate-300">Manage loads, negotiate freight and monitor commission health for your brokerage operations.</p>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Open loads</p>
            <p className="mt-4 text-3xl font-semibold text-white">{summary?.openLoads ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Pending commissions</p>
            <p className="mt-4 text-3xl font-semibold text-white">₹{summary?.pendingCommissions?.toLocaleString('en-IN') ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Active contracts</p>
            <p className="mt-4 text-3xl font-semibold text-white">{summary?.activeContracts ?? '—'}</p>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Broker action items</h2>
          <ul className="mt-6 space-y-4">
            {brokerTasks.map((task) => (
              <li key={task.title} className="rounded-3xl bg-slate-950/80 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-white">{task.title}</p>
                    <p className="mt-2 text-slate-300">{task.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">{task.status}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-xl font-semibold text-white">Current load matches</h2>
          <div className="mt-5 space-y-4">
            {loads.length === 0 ? (
              <p className="text-sm text-slate-400">Loading broker data…</p>
            ) : (
              loads.map((load) => (
                <div key={load.id} className="rounded-3xl bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-white">{load.id}</p>
                      <p className="mt-1 text-sm text-slate-300">{load.origin} → {load.destination}</p>
                    </div>
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">{load.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-slate-400">Freight: {load.freight}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
