import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

const VEHICLE_TYPES = ['truck', 'mini-truck', 'trailer', 'container', 'tanker', 'flatbed', 'reefer'];

function RegisterVehicleForm({ onRegistered }) {
  const [form, setForm] = useState({ licensePlate: '', type: 'truck', capacity: '', make: '', model: '', year: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const body = {
        licensePlate: form.licensePlate.toUpperCase().trim(),
        type: form.type,
      };
      if (form.capacity) body.capacity = parseFloat(form.capacity);
      if (form.make) body.make = form.make.trim();
      if (form.model) body.model = form.model.trim();
      if (form.year) body.year = parseInt(form.year, 10);

      await apiRequest('/fleet/vehicles', { method: 'POST', body });
      setSuccess(true);
      setForm({ licensePlate: '', type: 'truck', capacity: '', make: '', model: '', year: '' });
      onRegistered();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">License Plate *</label>
        <input
          name="licensePlate"
          value={form.licensePlate}
          onChange={handleChange}
          placeholder="MH12AB1234"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Vehicle Type *</label>
        <select
          name="type"
          value={form.type}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {VEHICLE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Capacity (tonnes)</label>
        <input
          name="capacity"
          type="number"
          min="0.1"
          max="100000"
          value={form.capacity}
          onChange={handleChange}
          placeholder="e.g. 20"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Make</label>
        <input
          name="make"
          value={form.make}
          onChange={handleChange}
          placeholder="Tata, Ashok Leyland…"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Model</label>
        <input
          name="model"
          value={form.model}
          onChange={handleChange}
          placeholder="407, 1109…"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Year</label>
        <input
          name="year"
          type="number"
          min="1980"
          max={new Date().getFullYear() + 1}
          value={form.year}
          onChange={handleChange}
          placeholder={String(new Date().getFullYear())}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {submitting ? 'Registering…' : 'Register Vehicle'}
        </button>
        {error && <p className="text-sm text-orange-300">{error}</p>}
        {success && <p className="text-sm text-emerald-300">Vehicle registered successfully!</p>}
      </div>
    </form>
  );
}

const STATUS_COLOR = {
  active: 'text-emerald-400',
  'in-transit': 'text-sky-400',
  maintenance: 'text-orange-400',
  inactive: 'text-slate-400',
  unknown: 'text-slate-500',
};

export function FleetWorkflow() {
  const [overview, setOverview] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiRequest('/fleet/overview'),
      apiRequest('/fleet/trucks'),
    ])
      .then(([overviewData, trucksData]) => {
        setOverview(overviewData.overview || null);
        setTrucks(trucksData.trucks || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Fleet management</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Fleet operations center</h1>
            <p className="mt-4 text-slate-300">Monitor truck utilization, fuel consumption and maintenance alerts in one place.</p>
          </div>
          <button
            onClick={() => setShowRegisterForm((v) => !v)}
            className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
          >
            {showRegisterForm ? 'Cancel' : '+ Register Vehicle'}
          </button>
        </div>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        {showRegisterForm && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <h2 className="text-lg font-semibold text-white">Register new vehicle</h2>
            <RegisterVehicleForm onRegistered={() => { setShowRegisterForm(false); loadData(); }} />
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Total vehicles</p>
            <p className="mt-4 text-3xl font-semibold text-white">{loading ? '—' : (overview?.totalVehicles ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Active vehicles</p>
            <p className="mt-4 text-3xl font-semibold text-white">{loading ? '—' : (overview?.activeVehicles ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Maintenance alerts</p>
            <p className="mt-4 text-3xl font-semibold text-orange-400">{loading ? '—' : (overview?.inTransitLoads ?? 0)}</p>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div>
              <h2 className="text-xl font-semibold text-white">Fleet vehicles</h2>
              <p className="mt-2 text-sm text-slate-400">Vehicles registered under your fleet account.</p>
            </div>
            <button
              onClick={loadData}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          <div className="divide-y divide-white/10">
            {loading ? (
              <div className="px-6 py-6 text-sm text-slate-400">Loading fleet data…</div>
            ) : trucks.length === 0 ? (
              <div className="px-6 py-6 text-sm text-slate-400">
                No vehicles registered yet. Click &ldquo;Register Vehicle&rdquo; above to add your first truck.
              </div>
            ) : (
              trucks.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{item.licensePlate || item.id}</p>
                    <p className="mt-1 text-sm text-slate-300">{item.type ? `Type: ${item.type}` : ''} {item.id !== item.licensePlate ? `· ${item.id}` : ''}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
                      Status:{' '}
                      <span className={STATUS_COLOR[item.status] || 'text-slate-400'}>
                        {item.status}
                      </span>
                    </div>
                    <div className="rounded-3xl bg-slate-950/80 px-4 py-3 text-sm text-slate-200">
                      Last update: {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-IN') : 'N/A'}
                      {item.isStale && <span className="ml-2 text-orange-400">(stale)</span>}
                    </div>
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
