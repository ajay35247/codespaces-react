import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useSocket } from '../hooks/useSocket';

function formatCurrency(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function VehicleRow({ vehicle, onDelete, busy }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-3 pr-4 text-sm font-medium text-white theme-heading">{vehicle.licensePlate}</td>
      <td className="py-3 pr-4 text-sm text-slate-300 theme-muted">{vehicle.type}</td>
      <td className="py-3 pr-4 text-sm text-slate-300 theme-muted">
        {vehicle.capacityTons ? `${vehicle.capacityTons} t` : '—'}
      </td>
      <td className="py-3 pr-4 text-sm text-slate-400 theme-muted">{vehicle.vehicleId}</td>
      <td className="py-3 pr-4 text-sm">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            vehicle.active === false
              ? 'border-slate-400/30 bg-slate-500/10 text-slate-300'
              : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {vehicle.active === false ? 'inactive' : 'active'}
        </span>
      </td>
      <td className="py-3 text-right text-sm">
        <button
          type="button"
          onClick={() => onDelete(vehicle.vehicleId)}
          disabled={busy}
          className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-40"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function AddVehicleForm({ onAdded }) {
  const [licensePlate, setLicensePlate] = useState('');
  const [type, setType] = useState('Truck');
  const [capacityTons, setCapacityTons] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { licensePlate: licensePlate.trim(), type: type.trim() };
      const capacity = Number(capacityTons);
      if (capacityTons && capacity > 0) body.capacityTons = capacity;
      await apiRequest('/fleet/vehicles', { method: 'POST', body });
      setLicensePlate('');
      setCapacityTons('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4 theme-panel sm:grid-cols-[1fr_1fr_120px_auto]">
      <input
        type="text"
        required
        minLength={2}
        maxLength={32}
        value={licensePlate}
        onChange={(e) => setLicensePlate(e.target.value)}
        placeholder="License plate (MH 12 AB 1234)"
        className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500"
      />
      <input
        type="text"
        required
        minLength={2}
        maxLength={64}
        value={type}
        onChange={(e) => setType(e.target.value)}
        placeholder="Type (Truck / Trailer / …)"
        className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500"
      />
      <input
        type="number"
        min="0"
        step="0.1"
        value={capacityTons}
        onChange={(e) => setCapacityTons(e.target.value)}
        placeholder="Cap (t)"
        className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500"
      />
      <button
        type="submit"
        disabled={saving || !licensePlate.trim() || !type.trim()}
        className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-40"
      >
        {saving ? 'Adding…' : 'Add vehicle'}
      </button>
      {error && <p className="sm:col-span-4 text-xs text-rose-300">{error}</p>}
    </form>
  );
}

function AssignDriverForm({ assignedLoads, vehicles, onAssigned }) {
  const [loadId, setLoadId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess('');
    try {
      const body = { loadId: loadId.trim(), driverId: driverId.trim() };
      if (vehicleId) body.vehicleId = vehicleId;
      const resp = await apiRequest('/fleet/assign-driver', { method: 'POST', body });
      setSuccess(`Assigned driver to ${resp.loadId}`);
      setLoadId('');
      setDriverId('');
      setVehicleId('');
      onAssigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-3xl border border-white/10 bg-slate-900/80 p-4 theme-panel sm:grid-cols-[1fr_1fr_1fr_auto]">
      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Load ID</label>
        <input
          type="text"
          required
          value={loadId}
          onChange={(e) => setLoadId(e.target.value)}
          placeholder="L-XXXXX"
          list="fleet-load-ids"
          className="mt-1 w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <datalist id="fleet-load-ids">
          {assignedLoads.map((l) => <option key={l.loadId} value={l.loadId} />)}
        </datalist>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Driver user ID</label>
        <input
          type="text"
          required
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          placeholder="24-char user id"
          minLength={24}
          maxLength={24}
          className="mt-1 w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Vehicle (optional)</label>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="mt-1 w-full rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          <option value="">(leave bound)</option>
          {vehicles.map((v) => (
            <option key={v.vehicleId} value={v.vehicleId}>{v.licensePlate} — {v.vehicleId}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="self-end rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-40"
      >
        {saving ? 'Assigning…' : 'Assign driver'}
      </button>
      {error && <p className="sm:col-span-4 text-xs text-rose-300">{error}</p>}
      {success && <p className="sm:col-span-4 text-xs text-emerald-300">{success}</p>}
    </form>
  );
}

export function TruckOwnerDashboard() {
  const [overview, setOverview] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, v] = await Promise.all([
        apiRequest('/fleet/overview'),
        apiRequest('/fleet/vehicles'),
      ]);
      setOverview(ov);
      setVehicles(v.vehicles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live refresh on load status changes (e.g. a driver marks POD → this
  // dashboard's in-transit count and earnings update without polling).
  useSocket('load:status-changed', () => { load(); });

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Delete this vehicle?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/fleet/vehicles/${encodeURIComponent(vehicleId)}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-8 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10 theme-panel">
        <p className="text-sm uppercase tracking-[0.32em] text-indigo-300">Truck Owner</p>
        <h1 className="mt-2 text-4xl font-semibold text-white theme-heading">Fleet dashboard</h1>
        <p className="mt-3 text-slate-300 theme-muted">
          Manage your vehicles, assign drivers to loads, and track earnings across delivered trips.
        </p>

        {error && <div className="mt-6 rounded-3xl bg-rose-500/10 p-4 text-sm text-rose-300">{error}</div>}

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 theme-panel">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Fleet size</p>
            <p className="mt-2 text-3xl font-semibold text-white theme-heading">{overview?.vehicleCount ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-500 theme-muted">{overview?.activeVehicleCount ?? 0} active</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 theme-panel">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">In transit</p>
            <p className="mt-2 text-3xl font-semibold text-white theme-heading">{overview?.assignedLoadCount ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 theme-panel">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Delivered</p>
            <p className="mt-2 text-3xl font-semibold text-white theme-heading">{overview?.deliveredLoadCount ?? '—'}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 theme-panel">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">Gross earnings</p>
            <p className="mt-2 text-3xl font-semibold text-white theme-heading">{formatCurrency(overview?.grossEarnings)}</p>
            <p className="mt-1 text-xs text-slate-500 theme-muted">from delivered loads</p>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-white theme-heading">Add vehicle</h2>
          <div className="mt-3">
            <AddVehicleForm onAdded={load} />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-white theme-heading">Assign a driver</h2>
          <p className="mt-2 text-sm text-slate-400 theme-muted">
            Assign one of your drivers to a load. The driver is notified instantly and the load moves to in-transit.
          </p>
          <div className="mt-3">
            <AssignDriverForm
              assignedLoads={overview?.assignedLoads || []}
              vehicles={vehicles}
              onAssigned={load}
            />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-white theme-heading">Vehicles</h2>
          <div className="mt-3 overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/80 p-4 theme-panel">
            {loading && <p className="text-sm text-slate-400">Loading…</p>}
            {!loading && vehicles.length === 0 && (
              <p className="text-sm text-slate-400 theme-muted">No vehicles yet — add your first truck above.</p>
            )}
            {!loading && vehicles.length > 0 && (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">
                    <th className="pb-3 pr-4 font-medium">Plate</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Capacity</th>
                    <th className="pb-3 pr-4 font-medium">Vehicle ID</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <VehicleRow key={v.vehicleId} vehicle={v} onDelete={handleDelete} busy={busy} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold text-white theme-heading">In-transit loads</h2>
          <div className="mt-3 overflow-x-auto rounded-3xl border border-white/10 bg-slate-900/80 p-4 theme-panel">
            {(!overview?.assignedLoads || overview.assignedLoads.length === 0) ? (
              <p className="text-sm text-slate-400 theme-muted">No loads in transit right now.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.2em] text-slate-400 theme-muted">
                    <th className="pb-3 pr-4 font-medium">Load</th>
                    <th className="pb-3 pr-4 font-medium">Route</th>
                    <th className="pb-3 pr-4 font-medium">Vehicle</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.assignedLoads.map((l) => (
                    <tr key={l.loadId} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-sm font-medium text-white theme-heading">{l.loadId}</td>
                      <td className="py-3 pr-4 text-sm text-slate-300 theme-muted">{l.origin} → {l.destination}</td>
                      <td className="py-3 pr-4 text-sm text-slate-400 theme-muted">{l.vehicleId || '—'}</td>
                      <td className="py-3 pr-4 text-sm text-slate-300 theme-muted">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
