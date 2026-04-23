import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';
import { Card3D } from '../components/Card3D';
import { RatingBadge, StarPicker } from '../components/RatingBadge';

// Hard cap matches MAX_POD_PHOTO_LENGTH on the backend (≈260 KB decoded).
const MAX_POD_PHOTO_DATA_URL_LENGTH = 350_000;

/**
 * Inline control to bind a vehicle (by vehicleId string) to the load so the
 * shipper's live tracking can follow it.  Pre-fills with the currently bound
 * vehicle when set.  Kept deliberately minimal — a driver typing their
 * vehicle's registration/ID is still leagues better than no link at all.
 */
function VehicleBinder({ load, onChanged }) {
  const [vehicleId, setVehicleId] = useState(load.vehicleId || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!vehicleId.trim()) return;
    setSaving(true); setErr(null);
    try {
      await apiRequest(`/loads/${load.loadId}/vehicle`, { method: 'POST', body: { vehicleId: vehicleId.trim() } });
      onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        placeholder="Vehicle ID (for live tracking)"
        className="w-48 rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !vehicleId.trim() || vehicleId === (load.vehicleId || '')}
        className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 transition hover:bg-sky-500/20 disabled:opacity-40"
        title="Bind this vehicle so the shipper can track it live"
      >
        {saving ? 'Saving…' : (load.vehicleId ? 'Update vehicle' : 'Bind vehicle')}
      </button>
      {err && <span className="text-[10px] text-rose-300">{err}</span>}
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read photo'));
    reader.readAsDataURL(file);
  });
}

function PodModal({ load, onClose, onSubmitted }) {
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handlePhoto = async (e) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) { setPhotoUrl(''); return; }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setPhotoError('Only PNG, JPEG or WEBP images are allowed.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (typeof dataUrl !== 'string' || dataUrl.length > MAX_POD_PHOTO_DATA_URL_LENGTH) {
        setPhotoError('Photo too large — please pick a smaller image (≈260 KB).');
        return;
      }
      setPhotoUrl(dataUrl);
    } catch (err) {
      setPhotoError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = { receiverName: receiverName.trim() };
      if (receiverPhone.trim()) body.receiverPhone = receiverPhone.trim();
      if (note.trim()) body.note = note.trim();
      if (photoUrl) body.photoUrl = photoUrl;
      await apiRequest(`/loads/${load.loadId}/pod`, { method: 'POST', body });
      onSubmitted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-300">Proof of Delivery</p>
            <h3 className="mt-1 text-lg font-bold text-white">{load.loadId}</h3>
            <p className="text-xs text-slate-400">{load.origin} → {load.destination}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </header>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Receiver name *</label>
          <input
            type="text" value={receiverName} onChange={(e) => setReceiverName(e.target.value)}
            required minLength={2} maxLength={120}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            placeholder="Who signed for the load?"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Receiver phone</label>
          <input
            type="text" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)}
            maxLength={40}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Note</label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            placeholder="Condition of goods, delays, anything to remember"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Photo (optional)</label>
          <input
            type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhoto}
            className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-full file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200"
          />
          {photoError && <p className="mt-1 text-xs text-orange-300">{photoError}</p>}
          {photoUrl && (
            <img src={photoUrl} alt="POD preview" className="mt-2 h-32 w-auto rounded-xl border border-white/10" />
          )}
        </div>

        {error && <p className="text-sm text-orange-300">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300">
            Cancel
          </button>
          <button
            type="submit" disabled={submitting || receiverName.trim().length < 2}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : '✓ Submit POD & Mark Delivered'}
          </button>
        </div>
      </form>
    </div>
  );
}

function BidModal({ load, onClose, onPlaced }) {
  const [amount, setAmount] = useState(load.freightPrice ? String(load.freightPrice) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/loads/bid', {
        method: 'POST',
        body: { loadId: load.loadId, amount: parseFloat(amount) },
      });
      onPlaced();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <header>
          <p className="text-xs uppercase tracking-widest text-orange-300">Place Bid</p>
          <h3 className="mt-1 text-lg font-bold text-white">{load.loadId}</h3>
          <p className="text-xs text-slate-400">{load.origin} → {load.destination}</p>
          {load.freightPrice && (
            <p className="mt-1 text-xs text-slate-500">Shipper&apos;s ask: ₹{load.freightPrice.toLocaleString('en-IN')}</p>
          )}
        </header>
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Your bid (₹) *</label>
          <input
            type="number" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        {error && <p className="text-sm text-orange-300">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300">Cancel</button>
          <button
            type="submit" disabled={submitting || !amount || parseFloat(amount) <= 0}
            className="rounded-full bg-orange-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
          >
            {submitting ? 'Placing…' : 'Place bid'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RateShipperModal({ load, onClose, onRated }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (stars < 1) { setError('Please select a star rating'); return; }
    setSubmitting(true); setError(null);
    try {
      const body = { stars };
      if (comment.trim()) body.comment = comment.trim();
      await apiRequest(`/loads/${load.loadId}/rate`, { method: 'POST', body });
      onRated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <header>
          <p className="text-xs uppercase tracking-widest text-amber-300">Rate Shipper</p>
          <h3 className="mt-1 text-lg font-bold text-white">{load.loadId}</h3>
        </header>
        <div className="flex justify-center"><StarPicker value={stars} onChange={setStars} /></div>
        <textarea
          value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={500}
          placeholder="Optional comment"
          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        {error && <p className="text-sm text-orange-300">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300">Cancel</button>
          <button type="submit" disabled={submitting || stars < 1}
            className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
            {submitting ? 'Saving…' : 'Submit rating'}
          </button>
        </div>
      </form>
    </div>
  );
}

function LoadCard({ load, onChanged, isAssigned, onPlaceBid }) {
  const [acting, setActing] = useState(false);
  const [error, setError] = useState(null);
  const [showPod, setShowPod] = useState(false);
  const [showRate, setShowRate] = useState(false);

  const driverHasRated = (load.ratings || []).some((r) => r.raterRole === 'driver');
  const paymentStatus = load.payment?.status || 'pending';
  const shipperUserId = typeof load.postedBy === 'object' && load.postedBy ? load.postedBy._id : load.postedBy;

  const ackPaymentReceived = async () => {
    setActing(true); setError(null);
    try {
      await apiRequest(`/loads/${load.loadId}/payment/received`, { method: 'POST', body: {} });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setActing(false);
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
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Load ID</span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadge}`}>
              {load.status}
            </span>
            {shipperUserId && <RatingBadge userId={shipperUserId} />}
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

          {isAssigned && load.status === 'delivered' && load.pod && (
            <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
              <p className="font-semibold">POD submitted to {load.pod.receiverName}{load.pod.receiverPhone ? ` (${load.pod.receiverPhone})` : ''}</p>
              {load.pod.note && <p className="mt-1 text-emerald-200/80">“{load.pod.note}”</p>}
            </div>
          )}

          {isAssigned && load.status === 'delivered' && (
            <div className="mt-2 text-xs text-slate-300">
              Payment:{' '}
              <span className={
                paymentStatus === 'received' ? 'text-emerald-300 font-semibold'
                : paymentStatus === 'released' ? 'text-amber-300 font-semibold'
                : 'text-slate-400'
              }>
                {paymentStatus}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {!isAssigned && load.status === 'posted' && (
            <button
              onClick={() => onPlaceBid(load)}
              className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-orange-500/20 transition hover:bg-orange-400"
            >
              💰 Place Bid
            </button>
          )}

          {isAssigned && load.status === 'in-transit' && (
            <>
              <VehicleBinder load={load} onChanged={onChanged} />
              <button
                onClick={() => setShowPod(true)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                ✓ Submit POD &amp; Deliver
              </button>
            </>
          )}

          {isAssigned && load.status === 'delivered' && paymentStatus === 'released' && (
            <button
              onClick={ackPaymentReceived}
              disabled={acting}
              className="rounded-full bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
            >
              {acting ? 'Saving…' : '💵 Mark Payment Received'}
            </button>
          )}

          {isAssigned && load.status === 'delivered' && !driverHasRated && (
            <button
              onClick={() => setShowRate(true)}
              className="rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              ★ Rate Shipper
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-orange-300">{error}</p>}

      {showPod && <PodModal load={load} onClose={() => setShowPod(false)} onSubmitted={() => { setShowPod(false); onChanged(); }} />}
      {showRate && <RateShipperModal load={load} onClose={() => setShowRate(false)} onRated={() => { setShowRate(false); onChanged(); }} />}
    </Card3D>
  );
}

export function DriverDashboard() {
  const [myLoads, setMyLoads] = useState([]);
  const [availableLoads, setAvailableLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('assigned');
  const [bidLoad, setBidLoad] = useState(null);

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
    { label: 'In Transit',       value: inTransit.length,     color: 'text-amber-400',   icon: '🚛' },
    { label: 'Delivered',        value: delivered.length,      color: 'text-emerald-400', icon: '✅' },
    { label: 'Available Loads',  value: availableLoads.length, color: 'text-cyan-400',    icon: '📦' },
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
            <p className="mt-3 text-slate-400">Find loads, place bids, submit POD on delivery and confirm payment.</p>
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
                <p className="mt-2 text-sm text-slate-500">Place a bid on an available load — once the shipper accepts, it will show up here.</p>
              </div>
            ) : (
              myLoads.map((load, i) => (
                <motion.div key={load.loadId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <LoadCard load={load} onChanged={loadData} isAssigned onPlaceBid={setBidLoad} />
                </motion.div>
              ))
            )
          ) : (
            availableLoads.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-lg font-semibold text-slate-300">No available loads at the moment.</p>
                <p className="mt-2 text-sm text-slate-500">Check back later.</p>
              </div>
            ) : (
              availableLoads.map((load, i) => (
                <motion.div key={load.loadId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <LoadCard load={load} onChanged={loadData} isAssigned={false} onPlaceBid={setBidLoad} />
                </motion.div>
              ))
            )
          )}
        </div>
      </motion.section>

      {bidLoad && (
        <BidModal
          load={bidLoad}
          onClose={() => setBidLoad(null)}
          onPlaced={() => { setBidLoad(null); loadData(); }}
        />
      )}
    </main>
  );
}
