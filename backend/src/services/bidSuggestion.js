// Dynamic bid suggestion — deterministic, statistical (NOT AI/ML).
//
// Given a target load (origin/destination/truckType) and a pool of historical
// delivered loads, return a suggested bid value plus a percentile range so
// the UI can show "fair / aggressive / premium" guidance.  All functions in
// this file are pure: they never touch the database or the network, which
// makes them straightforward to unit-test in isolation.
//
// The route layer (routes/loads.js) is responsible for fetching the
// historical pool with an indexed query and then calling suggestBidForLoad.
// Swap this single file for a trained model once enough labelled outcome
// data is available.

/** Lowercase + trim — matches the canonical form used elsewhere for lookups. */
function norm(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Linear-interpolation percentile of a pre-sorted ascending numeric array.
 * Returns null when the input is empty.  `p` is in [0, 1].
 */
export function percentile(sortedAsc, p) {
  if (!Array.isArray(sortedAsc) || sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.min(1, Math.max(0, Number(p) || 0));
  const idx = clamped * (sortedAsc.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/** Extract finite, positive freight prices and return them sorted ascending. */
export function extractPrices(loads) {
  return (loads || [])
    .map((l) => Number(l && l.freightPrice))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

// Minimum sample size before a basis is considered usable.
export const MIN_SAMPLE_SIZE = 3;

/**
 * Build a stats summary for a price array.  Returns null when the sample is
 * too small to draw meaningful percentiles from (< MIN_SAMPLE_SIZE).
 */
export function priceStats(prices) {
  if (!Array.isArray(prices) || prices.length < MIN_SAMPLE_SIZE) return null;
  return {
    min: prices[0],
    p25: Math.round(percentile(prices, 0.25)),
    median: Math.round(percentile(prices, 0.5)),
    p75: Math.round(percentile(prices, 0.75)),
    max: prices[prices.length - 1],
  };
}

/**
 * Pick the most specific historical sample that still has enough data:
 *   1. same truckType + same origin + same destination
 *   2. same truckType only
 *   3. nothing usable → returns { basis: 'insufficient-data' }
 *
 * `historicalLoads` should already be filtered to status='delivered' by the
 * caller; this function does no DB-level filtering of its own.
 */
export function selectSample(load, historicalLoads) {
  if (!load) return { basis: 'insufficient-data', prices: [] };
  const truckType = norm(load.truckType);
  const origin = norm(load.origin);
  const destination = norm(load.destination);
  const pool = Array.isArray(historicalLoads) ? historicalLoads : [];

  const byRoute = pool.filter((l) =>
    norm(l.truckType) === truckType
    && norm(l.origin) === origin
    && norm(l.destination) === destination
  );
  const routePrices = extractPrices(byRoute);
  if (routePrices.length >= MIN_SAMPLE_SIZE) {
    return { basis: 'route+truck', prices: routePrices };
  }

  const byTruck = pool.filter((l) => norm(l.truckType) === truckType);
  const truckPrices = extractPrices(byTruck);
  if (truckPrices.length >= MIN_SAMPLE_SIZE) {
    return { basis: 'truck-type', prices: truckPrices };
  }

  return { basis: 'insufficient-data', prices: [] };
}

/**
 * Top-level entry point for the route handler.
 *
 * Returns:
 *   {
 *     suggested: number | null,        // recommended bid (median of selected sample)
 *     range: { min, p25, median, p75, max } | null,
 *     sampleSize: number,              // size of the selected sample
 *     basis: 'route+truck' | 'truck-type' | 'insufficient-data',
 *     currentLowestBid: number | null, // lowest active bid on the load (context)
 *     currency: 'INR',
 *   }
 *
 * `suggested` is null when basis is 'insufficient-data'; the UI should fall
 * back to free-form entry in that case.
 */
export function suggestBidForLoad(load, historicalLoads) {
  const { basis, prices } = selectSample(load, historicalLoads);
  const stats = priceStats(prices);

  // Lowest pending or accepted bid on the load — useful as live context for
  // the bidder.  Rejected bids are excluded so a single low spam bid that
  // got rejected doesn't anchor the suggestion.
  const activeBidAmounts = ((load && load.bids) || [])
    .filter((b) => b && (b.status === 'pending' || b.status === 'accepted'))
    .map((b) => Number(b.amount))
    .filter((n) => Number.isFinite(n) && n > 0);
  const currentLowestBid = activeBidAmounts.length
    ? Math.min(...activeBidAmounts)
    : null;

  return {
    suggested: stats ? stats.median : null,
    range: stats,
    sampleSize: prices.length,
    basis,
    currentLowestBid,
    currency: 'INR',
  };
}
