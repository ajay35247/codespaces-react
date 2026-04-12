import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 19.076, lng: 72.8777 };

export function Tracking() {
  const token = useSelector((state) => state.auth.token);
  const [shipments, setShipments] = useState([]);
  const [routePath, setRoutePath] = useState([]);
  const [error, setError] = useState(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  useEffect(() => {
    fetch(`${API_URL}/api/tracking/locations`, {
      headers: { Authorization: `Bearer ${token || 'demo-token'}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load tracking data');
        }
        return response.json();
      })
      .then((data) => setShipments(data.shipments || []))
      .catch((error) => setError(error.message));
  }, [token]);

  useEffect(() => {
    if (!shipments.length) return;
    const shipment = shipments[0];
    fetch(`${API_URL}/api/tracking/route/${shipment.id}`, {
      headers: { Authorization: `Bearer ${token || 'demo-token'}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Unable to load route path');
        }
        return response.json();
      })
      .then((data) => setRoutePath(data.route?.path || []))
      .catch(() => {});
  }, [shipments]);

  const routePolyline = useMemo(() => routePath.map((point) => ({ lat: point.lat, lng: point.lon })), [routePath]);
  const selectedShipment = shipments[0];
  const center = selectedShipment ? { lat: selectedShipment.lat, lng: selectedShipment.lon } : defaultCenter;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Real-time GPS Tracking</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Live fleet location and route visibility</h1>
        <p className="mt-4 text-slate-300">Track your shipments across India with live coordinates, ETA and freight progress.</p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <div className="h-[420px] rounded-3xl bg-slate-950/80 p-2 shadow-inner shadow-slate-950/50">
              {isLoaded && GOOGLE_MAPS_API_KEY ? (
                <GoogleMap mapContainerStyle={mapContainerStyle} center={center} zoom={6}>
                  {routePolyline.length > 0 && (
                    <Polyline
                      path={routePolyline}
                      options={{ strokeColor: '#fb923c', strokeWeight: 4, clickable: false }}
                    />
                  )}
                  {shipments.map((shipment) => (
                    <Marker
                      key={shipment.id}
                      position={{ lat: shipment.lat, lng: shipment.lon }}
                      label={{ text: shipment.id, className: 'text-xs font-semibold text-white' }}
                    />
                  ))}
                </GoogleMap>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[1.75rem] bg-slate-950/90 text-center text-sm text-slate-400">
                  <div>
                    <p>Map loading…</p>
                    <p className="mt-2 text-xs text-slate-500">Set VITE_GOOGLE_MAPS_API_KEY in your env to render maps.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-lg shadow-slate-950/10">
              <h3 className="text-xl font-semibold text-white">Shipment progress</h3>
              <div className="mt-6 space-y-4">
                <div className="rounded-3xl bg-slate-950/80 p-4">
                  <p className="text-sm text-slate-400">Truck status</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedShipment ? selectedShipment.status : 'Waiting for load data'}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-950/80 p-4">
                    <p className="text-sm text-slate-400">Estimated arrival</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedShipment?.eta ?? '—'}</p>
                  </div>
                  <div className="rounded-3xl bg-slate-950/80 p-4">
                    <p className="text-sm text-slate-400">Distance remaining</p>
                    <p className="mt-2 text-xl font-semibold text-white">{selectedShipment ? '278 km' : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-lg shadow-slate-950/10">
              <h3 className="text-xl font-semibold text-white">Live shipments</h3>
              {error ? (
                <p className="text-sm text-orange-300">{error}</p>
              ) : (
                <ul className="mt-6 space-y-4">
                  {shipments.length > 0 ? (
                    shipments.map((shipment) => (
                      <li key={shipment.id} className="rounded-3xl bg-slate-950/80 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm text-slate-400">Shipment</p>
                            <p className="text-lg font-semibold text-white">{shipment.id}</p>
                          </div>
                          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-300">{shipment.status}</span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300">{shipment.lat}, {shipment.lon}</p>
                        <p className="mt-1 text-sm text-slate-400">ETA: {shipment.eta}</p>
                      </li>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">Loading shipments…</p>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
