/**
 * searchService — pure helpers shared by the public `/search` route, the
 * admin search-control endpoints, and the test suite.
 *
 * No database access lives in this module on purpose; routes pass already-
 * fetched documents in.  This keeps the service trivial to unit-test and
 * lets us swap the ranker (heuristic → ML) later without touching the HTTP
 * layer.
 */

// ── Defaults for admin-tunable knobs ────────────────────────────────────────
//
// Stored in `AdminControlState` under key 'search-control'.  The admin panel
// can write any subset of these — the route always merges over these
// defaults so a missing field never breaks ranking.
export const SEARCH_CONFIG_DEFAULTS = Object.freeze({
  recencyWeight: 1.0,    // boost for fresher loads
  priceWeight: 0.5,      // boost for higher freightPrice
  proximityWeight: 0.0,  // reserved — will weight geo-distance once lat/lng are wired
  sponsorBoost: 5.0,     // additive boost for sponsored loadIds
  textWeight: 1.0,       // multiplier on Mongo $text score
  // Per-filter visibility flags.  When false, the corresponding filter chip
  // is hidden in the UI and the backend ignores the matching query param.
  filters: {
    from: true,
    to: true,
    vehicle: true,
    loadType: true,
    price: true,
    date: true,
    distancePreference: true,
  },
  // Pinned load IDs.  Caps to 50 to keep the in-memory boost loop cheap.
  sponsoredLoadIds: [],
});

const ROUTE_SEPARATOR_RE = /\s*(?:->|→|=>|—|\bto\b)\s*/i;
const PIN_RE = /^\d{6}$/;

/**
 * Normalise a free-text place into the canonical form used for trending
 * aggregation.  Lower-cases, collapses internal whitespace, strips trailing
 * commas/dots — keeps the original Unicode (so "मुंबई" and "Mumbai" are
 * counted as different routes by design until we add aliasing).
 */
export function normaliseLocation(value) {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[\s,.\-]+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * parseRouteQuery — extract origin / destination (and intermediate stops)
 * from natural-language search input.  Recognised patterns:
 *
 *   "Delhi to Mumbai"
 *   "Delhi → Mumbai"
 *   "Delhi -> Jaipur -> Mumbai"  (multi-stop; first = origin, last = destination)
 *   "110001 to 400001"           (PIN-to-PIN)
 *
 * Returns `{ from, to, stops, isRoute }`.  `isRoute` is `false` when the
 * input did not contain a clear route separator, in which case the caller
 * should fall back to plain text search.
 */
export function parseRouteQuery(input) {
  const empty = { from: '', to: '', stops: [], isRoute: false };
  if (!input || typeof input !== 'string') return empty;

  const trimmed = input.trim();
  if (!trimmed) return empty;

  const parts = trimmed
    .split(ROUTE_SEPARATOR_RE)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return empty;

  const [from, ...rest] = parts;
  const to = rest[rest.length - 1];
  const stops = rest.slice(0, -1);

  return {
    from,
    to,
    stops,
    isRoute: Boolean(from && to),
    // Convenience flag for the route handler — both endpoints look like PINs.
    isPinPair: PIN_RE.test(from) && PIN_RE.test(to),
  };
}

// ── Tagging ─────────────────────────────────────────────────────────────────

/**
 * Compute the median freight price from a sample of loads on a given route.
 * Returns null when the sample is too small (< 3) to be meaningful.  Used
 * by the route handler to flag `high-paying` results.
 */
export function medianPrice(loads) {
  const prices = (loads || [])
    .map((l) => Number(l.freightPrice))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}

/**
 * Derive presentation tags for a single load.  All inputs are expected to
 * already be lean (plain-object) documents; this function never reaches out
 * to the database.
 *
 *   urgent       → pickupDate is within 24h of `now`
 *   high-paying  → freightPrice > 1.5 × median for this route (when known)
 *   verified     → poster's kycStatus === 'approved'
 *   sponsored    → admin pinned this loadId
 */
export function deriveTags({ load, posterKycStatus, routeMedianPrice, sponsoredLoadIds = [], now = Date.now() }) {
  const tags = [];
  if (!load) return tags;

  if (load.pickupDate) {
    const pickup = new Date(load.pickupDate).getTime();
    if (Number.isFinite(pickup) && pickup - now > 0 && pickup - now <= 24 * 60 * 60 * 1000) {
      tags.push('urgent');
    }
  }

  if (
    typeof load.freightPrice === 'number'
    && Number.isFinite(load.freightPrice)
    && Number.isFinite(routeMedianPrice)
    && routeMedianPrice > 0
    && load.freightPrice > routeMedianPrice * 1.5
  ) {
    tags.push('high-paying');
  }

  if (posterKycStatus === 'approved') {
    tags.push('verified');
  }

  if (Array.isArray(sponsoredLoadIds) && load.loadId && sponsoredLoadIds.includes(load.loadId)) {
    tags.push('sponsored');
  }

  return tags;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

/**
 * Compute a numeric rank score for a load given a config.  Larger is better.
 *
 * The `textScore` is the Mongo `$text` score when available (otherwise 0).
 * The other terms are normalised so that no single weight can dominate by
 * accident — e.g. recency is mapped onto a 0..1 curve over 14 days.
 */
export function rankScore({ load, config = SEARCH_CONFIG_DEFAULTS, textScore = 0, now = Date.now() }) {
  if (!load) return 0;
  const cfg = { ...SEARCH_CONFIG_DEFAULTS, ...config };

  // Recency: 1.0 today, decays to 0 over ~14 days.
  let recency = 0;
  if (load.createdAt) {
    const ageMs = now - new Date(load.createdAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0) {
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      recency = Math.max(0, 1 - ageDays / 14);
    }
  }

  // Price: log-scale so a 10× price swing roughly doubles its contribution.
  let priceTerm = 0;
  if (Number.isFinite(load.freightPrice) && load.freightPrice > 0) {
    priceTerm = Math.min(1, Math.log10(load.freightPrice + 1) / 6); // log10(1M) ≈ 6
  }

  let score = 0;
  score += cfg.textWeight * Number(textScore || 0);
  score += cfg.recencyWeight * recency;
  score += cfg.priceWeight * priceTerm;

  if (Array.isArray(cfg.sponsoredLoadIds) && load.loadId && cfg.sponsoredLoadIds.includes(load.loadId)) {
    score += cfg.sponsorBoost;
  }

  return score;
}

/**
 * Sort an array of `{ load, textScore }` by `rankScore` descending.  Returns
 * a new array; does not mutate the input.
 */
export function rankLoads(items, config = SEARCH_CONFIG_DEFAULTS, now = Date.now()) {
  return [...(items || [])].sort((a, b) => {
    const sa = rankScore({ load: a.load, config, textScore: a.textScore, now });
    const sb = rankScore({ load: b.load, config, textScore: b.textScore, now });
    return sb - sa;
  });
}

/**
 * Validate + clamp an admin-supplied search config.  Used by the admin route
 * before persisting to `AdminControlState` — never trust the raw body.
 */
export function sanitiseSearchConfig(input = {}) {
  const out = { ...SEARCH_CONFIG_DEFAULTS };
  const numericKeys = ['recencyWeight', 'priceWeight', 'proximityWeight', 'sponsorBoost', 'textWeight'];
  for (const key of numericKeys) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) {
      out[key] = Math.min(20, Math.max(0, input[key]));
    }
  }
  if (input.filters && typeof input.filters === 'object') {
    out.filters = { ...SEARCH_CONFIG_DEFAULTS.filters };
    for (const key of Object.keys(SEARCH_CONFIG_DEFAULTS.filters)) {
      if (typeof input.filters[key] === 'boolean') out.filters[key] = input.filters[key];
    }
  }
  if (Array.isArray(input.sponsoredLoadIds)) {
    out.sponsoredLoadIds = input.sponsoredLoadIds
      .filter((id) => typeof id === 'string')
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 64)
      .slice(0, 50);
  }
  return out;
}
