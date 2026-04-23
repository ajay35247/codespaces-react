import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { getSharedSocket } from '../hooks/useSocket';

/**
 * Browser-based driver GPS ping.  Uses `navigator.geolocation.watchPosition`
 * and the already-wired `socket.io` `update-location` channel — no native
 * app required.
 *
 * Honest limits (shown in-UI, not hidden):
 *   • iOS Safari suspends watchPosition when the tab goes to the background.
 *     A real, always-on driver tracker requires a signed native app.
 *   • Browser GPS accuracy is worse than a native fused-location provider.
 *   • If the device is offline, pings are dropped until the socket reconnects.
 */

const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 5_000,
};

// Minimum distance between successive pings that we actually emit, in
// metres.  Below this we assume jitter and skip the emission so we don't
// flood the backend with identical positions.
const MIN_MOVE_METRES = 25;

function haversineMetres(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function useBatteryStatus() {
  const [battery, setBattery] = useState(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.getBattery) return undefined;
    let mounted = true;
    let batteryRef = null;
    const update = (b) => {
      if (!mounted) return;
      setBattery({
        level: Math.round(b.level * 100),
        charging: b.charging,
      });
    };
    navigator.getBattery().then((b) => {
      batteryRef = b;
      update(b);
      b.addEventListener('levelchange', () => update(b));
      b.addEventListener('chargingchange', () => update(b));
    }).catch(() => {});
    return () => {
      mounted = false;
      if (batteryRef) {
        // Listeners can't be cleanly removed without refs; leave them —
        // the closure over `mounted` prevents state updates after unmount.
      }
    };
  }, []);
  return battery;
}

function useVisibilityWarning() {
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onChange = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return hidden;
}

function VehicleRegisterForm({ onRegistered }) {
  const [licensePlate, setLicensePlate] = useState('');
  const [type, setType] = useState('truck');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const data = await apiRequest('/tracking/my-vehicles', {
        method: 'POST',
        body: { licensePlate: licensePlate.trim(), type },
      });
      onRegistered(data.vehicle);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 space-y-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">License plate *</label>
        <input
          required minLength={2} maxLength={32}
          value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)}
          placeholder="MH12AB1234"
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Truck type *</label>
        <select
          value={type} onChange={(e) => setType(e.target.value)}
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        >
          {['truck', 'mini-truck', 'trailer', 'container', 'tanker', 'flatbed', 'reefer'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-orange-300">{error}</p>}
      <button
        type="submit" disabled={submitting || !licensePlate.trim()}
        className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
      >
        {submitting ? 'Registering…' : 'Register vehicle'}
      </button>
    </form>
  );
}

export function DriverLive() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [watching, setWatching] = useState(false);
  const [position, setPosition] = useState(null);
  const [pingCount, setPingCount] = useState(0);
  const [lastEmitAt, setLastEmitAt] = useState(null);
  const [geoError, setGeoError] = useState(null);

  const watchIdRef = useRef(null);
  const lastEmittedPosRef = useRef(null);

  const battery = useBatteryStatus();
  const tabHidden = useVisibilityWarning();

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const loadVehicles = useCallback(() => {
    setLoading(true);
    apiRequest('/tracking/my-vehicles')
      .then((data) => {
        setVehicles(data.vehicles || []);
        if (!selectedVehicleId && data.vehicles?.length) {
          setSelectedVehicleId(data.vehicles[0].vehicleId);
        }
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedVehicleId]);

  useEffect(() => { loadVehicles(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const emitPing = useCallback((coords) => {
    if (!selectedVehicleId) return;
    const socket = getSharedSocket();
    socket.emit('update-location', {
      vehicleId: selectedVehicleId,
      location: { lat: coords.latitude, lng: coords.longitude },
    });
    setPingCount((n) => n + 1);
    setLastEmitAt(new Date());
    lastEmittedPosRef.current = { lat: coords.latitude, lng: coords.longitude };
  }, [selectedVehicleId]);

  const handlePosition = useCallback((pos) => {
    setGeoError(null);
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed,
      heading: pos.coords.heading,
      timestamp: pos.timestamp,
    });
    // Only emit if we've moved meaningfully — avoid flooding.
    const last = lastEmittedPosRef.current;
    const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (!last || haversineMetres(last, current) >= MIN_MOVE_METRES) {
      emitPing(pos.coords);
    }
  }, [emitPing]);

  const handleGeoError = useCallback((err) => {
    setGeoError(err.message || 'Unable to read GPS');
  }, []);

  const start = () => {
    if (!supported || !selectedVehicleId || watching) return;
    setGeoError(null);
    try {
      const id = navigator.geolocation.watchPosition(handlePosition, handleGeoError, WATCH_OPTIONS);
      watchIdRef.current = id;
      setWatching(true);
    } catch (err) {
      setGeoError(err.message);
    }
  };

  const stop = useCallback(() => {
    if (watchIdRef.current != null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setWatching(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const accuracyLabel = position?.accuracy != null
    ? `±${Math.round(position.accuracy)} m`
    : '—';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/92 p-8 shadow-2xl ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Driver Live GPS</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Share my location</h1>
        <p className="mt-3 text-slate-300">
          Broadcast your phone&rsquo;s GPS to the shipper while you drive. This runs in your browser only —
          keep the page open and the screen on for a continuous stream.
        </p>

        {/* Honest limits */}
        <div className="mt-6 rounded-3xl border border-amber-400/30 bg-amber-500/5 p-4 text-xs text-amber-200 space-y-1">
          <p className="font-semibold text-amber-100">Known limits of browser GPS</p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-200/90">
            <li>On iOS Safari, location updates <em>stop</em> when this tab is in the background or the screen is locked.</li>
            <li>Browser GPS accuracy is worse than a native fused-location provider — expect ±10–50 m in motion.</li>
            <li>If the device goes offline, pings resume once the socket reconnects. No catch-up replay.</li>
            <li>A signed native driver app (with a foreground service) is the only way to get always-on background tracking.</li>
          </ul>
        </div>

        {!supported && (
          <div className="mt-6 rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            Your browser does not support the Geolocation API. Try Chrome/Edge/Firefox on a recent phone.
          </div>
        )}

        {loading ? (
          <p className="mt-6 text-slate-400">Loading your vehicles…</p>
        ) : error ? (
          <p className="mt-6 text-orange-300">{error}</p>
        ) : vehicles.length === 0 ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-300">Register a vehicle so the shipper knows what they&rsquo;re tracking.</p>
            <VehicleRegisterForm onRegistered={() => { setLoading(true); loadVehicles(); }} />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Vehicle</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => { if (!watching) setSelectedVehicleId(e.target.value); }}
                disabled={watching}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {vehicles.map((v) => (
                  <option key={v.vehicleId} value={v.vehicleId}>
                    {v.vehicleId} &mdash; {v.licensePlate} ({v.type})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Vehicle must be bound to an in-transit load by you (or auto-bound on bid accept) for the shipper to see your pings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!watching ? (
                <button
                  onClick={start}
                  disabled={!supported || !selectedVehicleId}
                  className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"
                >
                  ▶ Start sharing
                </button>
              ) : (
                <button
                  onClick={stop}
                  className="rounded-full bg-rose-500 px-6 py-2.5 text-sm font-bold text-white"
                >
                  ■ Stop
                </button>
              )}
              <Link to="/driver" className="rounded-full border border-white/20 bg-white/5 px-5 py-2 text-sm font-semibold text-slate-300">
                ← Back to dashboard
              </Link>
            </div>

            {watching && tabHidden && (
              <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200">
                ⚠️ This tab is in the background. Location updates may pause (especially on iOS).
                Keep this page visible with the screen on.
              </div>
            )}

            {geoError && (
              <div className="rounded-3xl border border-orange-400/30 bg-orange-500/10 p-4 text-sm text-orange-200">
                GPS error: {geoError}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusTile label="Latitude" value={position ? position.lat.toFixed(5) : '—'} />
              <StatusTile label="Longitude" value={position ? position.lng.toFixed(5) : '—'} />
              <StatusTile label="Accuracy" value={accuracyLabel} />
              <StatusTile
                label="Speed"
                value={position?.speed != null ? `${Math.round(position.speed * 3.6)} km/h` : '—'}
              />
              <StatusTile label="Pings sent" value={String(pingCount)} />
              <StatusTile
                label="Last emit"
                value={lastEmitAt ? lastEmitAt.toLocaleTimeString() : '—'}
              />
              <StatusTile
                label="Battery"
                value={battery ? `${battery.level}%${battery.charging ? ' ⚡' : ''}` : 'n/a'}
              />
              <StatusTile
                label="Tab state"
                value={tabHidden ? 'hidden ⚠️' : 'visible'}
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function StatusTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}
