import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

const DEAL_COLUMNS = [
  { id: 'quoted', label: 'Quoted', accent: 'border-sky-500/40 text-sky-200', hint: 'Bid pending, load still open' },
  { id: 'won', label: 'Won', accent: 'border-amber-500/40 text-amber-200', hint: 'Bid accepted, load in-transit' },
  { id: 'delivered', label: 'Delivered', accent: 'border-emerald-500/40 text-emerald-200', hint: 'Completed — payout pending' },
  { id: 'lost', label: 'Lost', accent: 'border-rose-500/40 text-rose-200', hint: 'Bid rejected' },
];

function DealCard({ load }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-3">
      <p className="text-xs font-semibold text-white">{load.loadId}</p>
      <p className="mt-1 text-xs text-slate-400">{load.origin} → {load.destination}</p>
      <p className="mt-1 text-xs text-slate-500">
        Bid ₹{(load.myBid?.amount || 0).toLocaleString('en-IN')}
        {load.freightPrice ? ` • Freight ₹${load.freightPrice.toLocaleString('en-IN')}` : ''}
      </p>
      {load.payment?.status && load.payment.status !== 'pending' && (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-emerald-400">Payment {load.payment.status}</p>
      )}
    </div>
  );
}

function DealBoard({ deals, loading }) {
  if (loading && !deals) {
    return <p className="mt-8 text-sm text-slate-400">Loading deal pipeline…</p>;
  }
  if (!deals) return null;
  const totals = deals.totals || {};
  return (
    <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Deal pipeline</h2>
          <p className="mt-1 text-sm text-slate-400">Your bids grouped by outcome.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
            Won value ₹{(totals.totalWonAmount || 0).toLocaleString('en-IN')}
          </span>
          <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-300">
            Quoted value ₹{(totals.totalQuotedAmount || 0).toLocaleString('en-IN')}
          </span>
          <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-300">
            Lost value ₹{(totals.totalLostAmount || 0).toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        {DEAL_COLUMNS.map((col) => {
          const items = deals.pipeline?.[col.id] || [];
          return (
            <div key={col.id} className={`rounded-3xl border bg-slate-950/70 p-4 ${col.accent}`}>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold uppercase tracking-wider">{col.label}</p>
                <span className="rounded-full bg-slate-900/80 px-2 py-0.5 text-xs text-slate-300">{items.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{col.hint}</p>
              <div className="mt-3 space-y-2">
                {items.length === 0
                  ? <p className="text-xs text-slate-600">—</p>
                  : items.slice(0, 8).map((load) => <DealCard key={load.loadId} load={load} />)
                }
                {items.length > 8 && (
                  <p className="text-[10px] uppercase text-slate-500">+{items.length - 8} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BrokerWorkflow() {
  const [summary, setSummary] = useState(null);
  const [loads, setLoads] = useState([]);
  const [myBidLoads, setMyBidLoads] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidAmounts, setBidAmounts] = useState({});
  const [bidStatus, setBidStatus] = useState({});

  const [deals, setDeals] = useState(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiRequest('/broker/summary'),
      apiRequest('/broker/loads'),
      apiRequest('/broker/deals').catch(() => null),
    ])
      .then(([summaryData, loadsData, dealsData]) => {
        setSummary(summaryData.summary || null);
        setLoads(loadsData.loads || []);
        setDeals(dealsData || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleBid = async (loadId) => {
    const amount = parseFloat(bidAmounts[loadId]);
    if (!amount || amount <= 0) {
      setBidStatus({ ...bidStatus, [loadId]: { error: 'Enter a valid bid amount' } });
      return;
    }
    setBidStatus({ ...bidStatus, [loadId]: { loading: true } });
    try {
      await apiRequest('/loads/bid', { method: 'POST', body: { loadId, amount } });
      setBidStatus({ ...bidStatus, [loadId]: { success: 'Bid submitted!' } });
      setBidAmounts({ ...bidAmounts, [loadId]: '' });
      loadData();
    } catch (err) {
      setBidStatus({ ...bidStatus, [loadId]: { error: err.message } });
    }
  };

  const handleNegotiate = async (loadId) => {
    const proposedRate = parseFloat(bidAmounts[loadId]);
    if (!proposedRate || proposedRate <= 0) {
      setBidStatus({ ...bidStatus, [loadId]: { error: 'Enter a valid proposed rate' } });
      return;
    }
    setBidStatus({ ...bidStatus, [loadId]: { loading: true } });
    try {
      await apiRequest('/broker/negotiate', { method: 'POST', body: { loadId, proposedRate } });
      setBidStatus({ ...bidStatus, [loadId]: { success: 'Rate updated!' } });
      setBidAmounts({ ...bidAmounts, [loadId]: '' });
      loadData();
    } catch (err) {
      setBidStatus({ ...bidStatus, [loadId]: { error: err.message } });
    }
  };

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
            <p className="mt-4 text-3xl font-semibold text-white">
              {loading ? '—' : (summary?.openLoads ?? '0')}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Pending bids</p>
            <p className="mt-4 text-3xl font-semibold text-white">
              {loading ? '—' : (summary?.pendingBids ?? '0')}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">Active contracts</p>
            <p className="mt-4 text-3xl font-semibold text-white">
              {loading ? '—' : (summary?.activeContracts ?? '0')}
            </p>
          </div>
        </div>

        <DealBoard deals={deals} loading={loading} />

        <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Available loads to bid</h2>
            <button
              onClick={loadData}
              className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {loading ? (
              <p className="text-sm text-slate-400">Loading loads…</p>
            ) : loads.length === 0 ? (
              <p className="text-sm text-slate-400">No open loads at the moment.</p>
            ) : (
              loads.map((load) => {
                const st = bidStatus[load.loadId] || {};
                return (
                  <div key={load.loadId} className="rounded-3xl bg-slate-950/80 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-slate-400">Load ID</p>
                        <p className="text-base font-semibold text-white">{load.loadId}</p>
                        <p className="mt-1 text-sm text-slate-300">{load.origin} → {load.destination}</p>
                        <p className="mt-1 text-sm text-slate-400">Weight: {load.weight} | Type: {load.truckType}</p>
                        {load.freightPrice && (
                          <p className="mt-1 text-sm text-slate-400">Freight: ₹{load.freightPrice.toLocaleString('en-IN')}</p>
                        )}
                      </div>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-300">{load.status}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <input
                        type="number"
                        min="1"
                        placeholder="Your bid (₹)"
                        value={bidAmounts[load.loadId] || ''}
                        onChange={(e) => setBidAmounts({ ...bidAmounts, [load.loadId]: e.target.value })}
                        className="w-36 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500"
                      />
                      <button
                        onClick={() => handleBid(load.loadId)}
                        disabled={st.loading}
                        className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:opacity-50"
                      >
                        {st.loading ? 'Submitting…' : 'Place Bid'}
                      </button>
                      <button
                        onClick={() => handleNegotiate(load.loadId)}
                        disabled={st.loading}
                        className="rounded-full border border-sky-400/50 px-4 py-2 text-sm text-sky-300 transition hover:bg-sky-900 disabled:opacity-50"
                      >
                        Negotiate Rate
                      </button>
                    </div>
                    {st.error && <p className="mt-2 text-xs text-orange-300">{st.error}</p>}
                    {st.success && <p className="mt-2 text-xs text-emerald-300">{st.success}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
