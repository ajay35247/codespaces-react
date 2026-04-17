import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export function FleetWorkflow() {
  const [overview, setOverview] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiRequest('/fleet/overview'),
      apiRequest('/fleet/trucks'),
    ])
      .then(([overviewData, trucksData]) => {
        if (overviewData.error) throw new Error(overviewData.error);
        if (trucksData.error) throw new Error(trucksData.error);
        setOverview(overviewData.fleetOverview || null);
        setTrucks(trucksData.trucks || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Fleet management</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Fleet operations center</h1>
        <p className="mt-4 text-slate-300">Monitor truck utilization, fuel consumption and maintenance alerts in one place.</p>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Trucks managed</p>
            <p className="mt-4 text-3xl font-semibold text-white">{overview?.trucksActive ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Utilization</p>
            <p className="mt-4 text-3xl font-semibold text-white">{overview?.utilization ?? '—'}%</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Maintenance alerts</p>
            <p className="mt-4 text-3xl font-semibold text-orange-400">{overview?.maintenanceAlerts ?? '—'}</p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80">
          <div className="px-6 py-5 border-b border-white/10">
            <h2 className="text-xl font-semibold text-white">Truck utilization</h2>
            <p className="mt-2 text-sm text-slate-400">Review operational status and fuel usage across the fleet.</p>
          </div>
          <div className="divide-y divide-white/10">
            {trucks.length === 0 ? (
              <div className="px-6 py-6 text-sm text-slate-400">Loading fleet data…</div>
            ) : (
              trucks.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{item.id}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.status}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Utilization: {item.utilization}</div>
                    <div className="rounded-3xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">Next service: {item.nextService}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
