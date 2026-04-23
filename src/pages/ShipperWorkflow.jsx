import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { RatingBadge, StarPicker } from '../components/RatingBadge';

const TRUCK_TYPES = ['truck', 'mini-truck', 'trailer', 'container', 'tanker', 'flatbed', 'reefer'];

const STATUS_BADGE = {
  posted: 'bg-sky-800 text-sky-200',
  'in-transit': 'bg-amber-800 text-amber-200',
  delivered: 'bg-emerald-800 text-emerald-200',
  cancelled: 'bg-slate-700 text-slate-400',
};

function CreateLoadForm({ onCreated }) {
  const [form, setForm] = useState({
    origin: '', destination: '', weight: '', truckType: 'truck',
    freightPrice: '', pickupDate: '', dropDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        weight: form.weight.trim(),
        truckType: form.truckType,
      };
      if (form.freightPrice) body.freightPrice = parseFloat(form.freightPrice);
      if (form.pickupDate) body.pickupDate = form.pickupDate;
      if (form.dropDate) body.dropDate = form.dropDate;

      const data = await apiRequest('/loads', { method: 'POST', body });
      setSuccess(`Load ${data.load?.loadId} created successfully!`);
      setForm({ origin: '', destination: '', weight: '', truckType: 'truck', freightPrice: '', pickupDate: '', dropDate: '' });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1">Origin *</label>
        <input
          name="origin"
          value={form.origin}
          onChange={handleChange}
          placeholder="Mumbai, Maharashtra"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Destination *</label>
        <input
          name="destination"
          value={form.destination}
          onChange={handleChange}
          placeholder="Delhi, NCT"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Weight / Volume *</label>
        <input
          name="weight"
          value={form.weight}
          onChange={handleChange}
          placeholder="e.g. 10 tonnes"
          required
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Truck Type *</label>
        <select
          name="truckType"
          value={form.truckType}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        >
          {TRUCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Freight Price (₹)</label>
        <input
          name="freightPrice"
          type="number"
          min="1"
          step="0.01"
          value={form.freightPrice}
          onChange={handleChange}
          placeholder="e.g. 45000"
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Pickup Date</label>
        <input
          name="pickupDate"
          type="date"
          value={form.pickupDate}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Drop Date</label>
        <input
          name="dropDate"
          type="date"
          value={form.dropDate}
          onChange={handleChange}
          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post Load'}
        </button>
        {error && <p className="text-sm text-orange-300">{error}</p>}
        {success && <p className="text-sm text-emerald-300">{success}</p>}
      </div>
    </form>
  );
}

function BidRow({ bid, loadId, loadStatus, onAction }) {
  const [acting, setActing] = useState(false);

  const handleAccept = async () => {
    setActing(true);
    try {
      await apiRequest(`/loads/${loadId}/bids/${bid._id}/accept`, { method: 'POST' });
      onAction();
    } catch (err) {
      console.error('Accept bid error:', err.message);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await apiRequest(`/loads/${loadId}/bids/${bid._id}/reject`, { method: 'POST' });
      onAction();
    } catch (err) {
      console.error('Reject bid error:', err.message);
    } finally {
      setActing(false);
    }
  };

  const bidderOrBrokerId = bid.bidderId || bid.brokerId;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-800/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <span className="text-slate-400">Bid amount: </span>
          <span className="font-semibold text-white">₹{bid.amount?.toLocaleString('en-IN')}</span>
          <span className={`ml-3 rounded-full px-2 py-0.5 text-xs ${bid.status === 'accepted' ? 'bg-emerald-800 text-emerald-200' : bid.status === 'rejected' ? 'bg-slate-700 text-slate-400' : 'bg-sky-800 text-sky-200'}`}>
            {bid.status}
          </span>
        </div>
        {bidderOrBrokerId && (
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">{bid.bidderRole || 'bidder'}</span>
            <RatingBadge userId={bidderOrBrokerId} />
          </span>
        )}
      </div>
      {loadStatus === 'posted' && bid.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            disabled={acting}
            className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            onClick={handleReject}
            disabled={acting}
            className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function RateDriverModal({ load, onClose, onRated }) {
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
          <p className="text-xs uppercase tracking-widest text-amber-300">Rate Driver</p>
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

function LoadCard({ load, onStatusChange }) {
  const [expandBids, setExpandBids] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [showRate, setShowRate] = useState(false);

  const shipperHasRated = (load.ratings || []).some((r) => r.raterRole === 'shipper');
  const paymentStatus = load.payment?.status || 'pending';
  const driverId = typeof load.assignedDriver === 'object' && load.assignedDriver
    ? load.assignedDriver._id
    : load.assignedDriver;

  const handleCancel = async () => {
    if (!window.confirm('Cancel this load?')) return;
    setUpdating(true); setError(null);
    try {
      await apiRequest(`/loads/${load.loadId}/status`, { method: 'PATCH', body: { status: 'cancelled' } });
      onStatusChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const releasePayment = async () => {
    if (!window.confirm('Mark this freight payment as released to the driver?')) return;
    setUpdating(true); setError(null);
    try {
      await apiRequest(`/loads/${load.loadId}/payment/release`, { method: 'POST', body: {} });
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
            <p className="mt-1 text-xs text-slate-400">Freight: ₹{load.freightPrice.toLocaleString('en-IN')}</p>
          )}
          {load.pickupDate && (
            <p className="mt-1 text-xs text-slate-400">Pickup: {new Date(load.pickupDate).toLocaleDateString('en-IN')}</p>
          )}
          {driverId && (
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              Driver: <RatingBadge userId={driverId} />
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_BADGE[load.status] || 'bg-slate-700 text-slate-300'}`}>
            {load.status}
          </span>
          {load.status === 'posted' && (
            <button
              onClick={handleCancel}
              disabled={updating}
              className="rounded-full bg-slate-700 px-3 py-1 text-xs text-white transition hover:bg-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {load.status === 'delivered' && paymentStatus === 'pending' && load.pod && (
            <button
              onClick={releasePayment}
              disabled={updating}
              className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              💸 Release Payment
            </button>
          )}
          {load.status === 'delivered' && paymentStatus !== 'pending' && (
            <span className={`rounded-full px-3 py-1 text-xs ${paymentStatus === 'received' ? 'bg-emerald-800 text-emerald-200' : 'bg-amber-800 text-amber-200'}`}>
              Payment {paymentStatus}
            </span>
          )}
          {load.status === 'delivered' && !shipperHasRated && (
            <button
              onClick={() => setShowRate(true)}
              className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              ★ Rate Driver
            </button>
          )}
        </div>
      </div>

      {load.status === 'delivered' && load.pod && (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
          <p className="font-semibold uppercase tracking-wide text-emerald-300">Proof of Delivery</p>
          <p className="mt-1">Received by {load.pod.receiverName}{load.pod.receiverPhone ? ` (${load.pod.receiverPhone})` : ''}</p>
          {load.pod.note && <p className="mt-1 italic text-emerald-200/80">“{load.pod.note}”</p>}
          {load.pod.deliveredAt && (
            <p className="mt-1 text-emerald-200/60">Delivered: {new Date(load.pod.deliveredAt).toLocaleString('en-IN')}</p>
          )}
          {load.pod.photoUrl && (
            <img src={load.pod.photoUrl} alt="POD" className="mt-2 h-32 w-auto rounded-xl border border-emerald-400/20" />
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-orange-300">{error}</p>}

      {load.bids && load.bids.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setExpandBids((v) => !v)}
            className="text-xs text-sky-400 hover:underline"
          >
            {expandBids ? 'Hide' : `View ${load.bids.length} bid(s)`}
          </button>
          {expandBids && (
            <div className="mt-3 space-y-2">
              {load.bids.map((bid) => (
                <BidRow
                  key={bid._id}
                  bid={bid}
                  loadId={load.loadId}
                  loadStatus={load.status}
                  onAction={onStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {load.bids && load.bids.length === 0 && load.status === 'posted' && (
        <p className="mt-4 text-xs text-slate-500">No bids yet. Drivers and brokers will bid on this load.</p>
      )}

      {showRate && (
        <RateDriverModal load={load} onClose={() => setShowRate(false)} onRated={() => { setShowRate(false); onStatusChange(); }} />
      )}
    </div>
  );
}

export function ShipperWorkflow() {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = () => {
    setLoading(true);
    const url = statusFilter ? `/loads/mine?status=${statusFilter}` : '/loads/mine';
    apiRequest(url)
      .then((data) => {
        setLoads(data.loads || []);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 sm:px-10">
      <section className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 ring-1 ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-orange-300">Shipper operations</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">My loads</h1>
            <p className="mt-4 text-slate-300">Create, track and manage your freight loads. Accept broker bids and monitor delivery status.</p>
          </div>
          <button
            onClick={() => setShowCreateForm((v) => !v)}
            className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-orange-400"
          >
            {showCreateForm ? 'Cancel' : '+ Post New Load'}
          </button>
        </div>

        {showCreateForm && (
          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <h2 className="text-lg font-semibold text-white">Post a new load</h2>
            <CreateLoadForm onCreated={() => { setShowCreateForm(false); loadData(); }} />
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {['', 'posted', 'in-transit', 'delivered', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${statusFilter === s ? 'bg-orange-500 text-slate-950' : 'border border-white/20 text-slate-300 hover:bg-slate-800'}`}
            >
              {s || 'All'}
            </button>
          ))}
          <button
            onClick={loadData}
            className="ml-auto rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {error && <p className="mt-6 text-sm text-orange-300">{error}</p>}

        <div className="mt-6 space-y-4">
          {loading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-3xl border border-white/10 bg-slate-900/80" />
            ))
          ) : loads.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 text-center text-slate-400">
              <p className="text-lg">No loads found.</p>
              <p className="mt-2 text-sm">Click &ldquo;Post New Load&rdquo; to add your first shipment.</p>
            </div>
          ) : (
            loads.map((load) => (
              <LoadCard key={load.loadId} load={load} onStatusChange={loadData} />
            ))
          )}
        </div>
      </section>
    </main>
  );
}
