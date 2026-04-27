const TAG_STYLES = {
  urgent:        'bg-rose-500/20 text-rose-200 ring-rose-400/30',
  'high-paying': 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/30',
  verified:      'bg-cyan-500/20 text-cyan-200 ring-cyan-400/30',
  sponsored:     'bg-amber-500/20 text-amber-200 ring-amber-400/30',
};
const TAG_LABELS = {
  urgent: 'Urgent',
  'high-paying': 'High paying',
  verified: 'KYC verified',
  sponsored: 'Sponsored',
};

/**
 * Color-coded role badges used by the search result card to indicate who
 * posted the load.  Mirrors the role list in routes/AppRoutes.jsx.
 */
const ROLE_STYLES = {
  shipper: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  driver: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
  truck_owner: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  broker: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30',
  admin: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
};

function formatRole(role) {
  if (!role) return 'Unknown';
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPrice(amount, currency = 'INR') {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * SearchResultCard — single result tile shown in the grid.  The quick action
 * buttons are deliberately routed through the existing flows in the app
 * (loads detail page, chat panel) rather than being wired to direct API
 * calls here so we keep the search slice read-only in Phase 1.
 */
export function SearchResultCard({ load, currentUserRole, onPlaceBid, onAcceptLoad, onChat }) {
  if (!load) return null;
  const roleClass = ROLE_STYLES[load.postedByRole] || 'bg-slate-500/15 text-slate-200 border-slate-400/30';
  const price = formatPrice(load.freightPrice);
  const topBidPrice = load.topBid ? formatPrice(load.topBid.amount, load.topBid.currency) : null;
  const pickup = formatDate(load.pickupDate);

  // Action visibility: drivers/truck-owners typically place bids or accept;
  // shippers and brokers can chat with the poster.  Admin sees all actions
  // disabled — they manage from the admin panel.
  const canBid = ['driver', 'truck_owner', 'broker'].includes(currentUserRole) && load.status === 'posted';
  const canAccept = currentUserRole === 'driver' && load.status === 'posted';
  const canChat = Boolean(currentUserRole) && currentUserRole !== 'admin';

  return (
    <article
      className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-slate-950/40 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10"
      data-testid={`search-result-${load.id}`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-slate-400">
            {load.loadId}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            <span>{load.origin}</span>
            <span className="mx-2 text-slate-500" aria-hidden="true">→</span>
            <span>{load.destination}</span>
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${roleClass}`}
          title={`Posted by ${load.poster?.name || formatRole(load.postedByRole)}`}
        >
          {formatRole(load.postedByRole)}
        </span>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm text-slate-300">
        <div>
          <dt className="text-xs uppercase text-slate-500">Vehicle</dt>
          <dd className="text-slate-200">{load.truckType || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Weight</dt>
          <dd className="text-slate-200">{load.weight || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Price</dt>
          <dd className="font-semibold text-emerald-300">{price || '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Top bid</dt>
          <dd className="text-slate-200">
            {topBidPrice || (load.bidCount > 0 ? `${load.bidCount} bid${load.bidCount === 1 ? '' : 's'}` : 'No bids')}
          </dd>
        </div>
        {pickup && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-slate-500">Pickup</dt>
            <dd className="text-slate-200">{pickup}</dd>
          </div>
        )}
      </dl>

      {Array.isArray(load.tags) && load.tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Load tags">
          {load.tags.map((t) => (
            <li
              key={t}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                TAG_STYLES[t] || 'bg-slate-500/20 text-slate-200 ring-slate-400/30'
              }`}
            >
              {TAG_LABELS[t] || t}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {canBid && (
          <button
            type="button"
            onClick={() => onPlaceBid?.(load)}
            className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/30"
          >
            Place Bid
          </button>
        )}
        {canAccept && (
          <button
            type="button"
            onClick={() => onAcceptLoad?.(load)}
            className="rounded-full bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-100 transition hover:bg-sky-500/30"
          >
            Accept Load
          </button>
        )}
        {canChat && (
          <button
            type="button"
            onClick={() => onChat?.(load)}
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/20"
          >
            Chat / Contact
          </button>
        )}
      </div>
    </article>
  );
}

export default SearchResultCard;
