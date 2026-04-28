import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

/**
 * Renders the fair-value bid range for a load, fetched from
 * GET /loads/:loadId/bid-suggestion.  Pure presentational shell on top of
 * apiRequest — keeps the network logic out of the bidding pages so both
 * DriverDashboard's modal and BrokerWorkflow's inline form can share it.
 *
 * Props:
 *   loadId   — string, required
 *   onApply  — optional (suggested:number) => void.  When provided and a
 *              suggestion is available, a "Use ₹X" button is shown that
 *              calls onApply(suggested) so the parent can prefill its
 *              bid-amount input.
 *   compact  — boolean.  Inline (Broker) layout drops the header text;
 *              modal (Driver) layout keeps it.
 */
export default function BidSuggestionPanel({ loadId, onApply, compact = false }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!loadId) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    apiRequest(`/loads/${encodeURIComponent(loadId)}/bid-suggestion`)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ok', data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', message: err?.message || 'Failed to load suggestion' });
      });
    return () => { cancelled = true; };
  }, [loadId]);

  if (state.status === 'loading') {
    return (
      <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
        Loading bid suggestion…
      </div>
    );
  }

  if (state.status === 'error') {
    // Non-fatal: bidding still works.  Render a quiet inline notice rather
    // than blocking the form on a metadata fetch failure.
    return (
      <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-500">
        Bid suggestion unavailable
      </div>
    );
  }

  const { data } = state;
  if (!data) return null;

  if (data.basis === 'insufficient-data' || !data.suggested) {
    return (
      <div className="rounded-2xl border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
        Not enough delivered loads on this route to suggest a price yet.
      </div>
    );
  }

  const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const basisLabel =
    data.basis === 'route+truck'
      ? 'this route + truck type'
      : 'this truck type';

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs text-slate-200">
      {!compact && (
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Fair-value range
        </p>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-white">
          Suggested: {fmt(data.suggested)}
        </span>
        {data.range && (
          <span className="text-slate-400">
            {fmt(data.range.p25)} – {fmt(data.range.p75)} typical · {fmt(data.range.min)}–{fmt(data.range.max)} range
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.65rem] text-slate-500">
        Based on {data.sampleSize} delivered load{data.sampleSize === 1 ? '' : 's'} ({basisLabel})
        {Number.isFinite(data.currentLowestBid)
          ? ` · current lowest bid: ${fmt(data.currentLowestBid)}`
          : ''}
      </p>
      {typeof onApply === 'function' && (
        <button
          type="button"
          onClick={() => onApply(data.suggested)}
          className="mt-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-[0.7rem] font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
        >
          Use {fmt(data.suggested)}
        </button>
      )}
    </div>
  );
}
