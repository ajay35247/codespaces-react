import mongoose from 'mongoose';
import Load from '../schemas/LoadSchema.js';

/**
 * Deterministic "smart ranking" — NOT machine learning, NOT AI.
 *
 * Given a list of loads and an optional driver context, compute a score for
 * each load and return them sorted in descending score order.  The score is
 * a weighted sum of four signals:
 *
 *   • freshness      — newer posts rank higher (decays linearly over 72h)
 *   • rate delta     — freight price vs the historical average for the same
 *                      truckType ranks higher when the load pays more than
 *                      average
 *   • origin overlap — token overlap between the load's origin/destination
 *                      strings and the driver's last-known origin string
 *                      (honest stand-in for geodesic distance — we don't
 *                      store lat/lng for load origins today)
 *   • driver rating  — (on the driver-ranking side) drivers with higher
 *                      average ratings rank higher
 *
 * This is a one-file replacement target: when the platform has enough
 * labelled outcomes (accepted bids, on-time deliveries, disputes) the
 * scoreLoad function can be swapped for a trained model without touching
 * any route handlers.
 */

const FRESHNESS_DECAY_MS = 72 * 60 * 60 * 1000;

const STOP_WORDS = new Set([
  'the', 'and', 'to', 'from', 'for', 'a', 'an', 'of', 'in', 'on', 'at', 'by',
]);

function tokenize(str) {
  if (!str) return new Set();
  return new Set(
    String(str)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
  );
}

/** Jaccard similarity between two token sets. */
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/** Average freight price per truck type across posted/in-transit loads. */
export async function getAverageFreightByTruckType() {
  const rows = await Load.aggregate([
    { $match: { freightPrice: { $gt: 0 }, status: { $in: ['posted', 'in-transit', 'delivered'] } } },
    { $group: { _id: '$truckType', avg: { $avg: '$freightPrice' }, count: { $sum: 1 } } },
  ]);
  const map = {};
  for (const row of rows) {
    if (row._id && row.count >= 3) {
      map[row._id] = row.avg;
    }
  }
  return map;
}

/** Average stars a driver has received across all their delivered loads. */
export async function getDriverRating(driverId) {
  if (!driverId || !mongoose.Types.ObjectId.isValid(driverId)) return null;
  const [row] = await Load.aggregate([
    { $unwind: '$ratings' },
    { $match: {
      'ratings.rateeId': new mongoose.Types.ObjectId(String(driverId)),
      'ratings.raterRole': 'shipper',
    } },
    { $group: { _id: null, avg: { $avg: '$ratings.stars' }, count: { $sum: 1 } } },
  ]);
  if (!row || !row.count) return null;
  return { avgStars: row.avg, count: row.count };
}

/**
 * Compute a single load's ranking score for a given driver context.
 *
 * @param {object} load              - Load mongoose document (lean OK).
 * @param {object} context
 * @param {object} context.avgByTruckType - map of truckType → avg freight
 * @param {object} [context.lastLoad]     - driver's most recent delivered load
 * @returns {{ score: number, breakdown: object }}
 */
export function scoreLoad(load, context = {}) {
  const now = Date.now();
  const { avgByTruckType = {}, lastLoad = null } = context;

  // ── 1. Freshness (0..1): newer = higher
  const ageMs = Math.max(0, now - new Date(load.createdAt).getTime());
  const freshness = Math.max(0, 1 - ageMs / FRESHNESS_DECAY_MS);

  // ── 2. Rate delta (0..1): how much better this load pays vs average for
  //       its truckType.  1.0 means ≥2x average; 0.5 = average; 0 = <=0.
  const avg = avgByTruckType[load.truckType];
  let rateDelta = 0.5;
  if (avg && avg > 0 && load.freightPrice) {
    const ratio = load.freightPrice / avg; // 1.0 = average
    rateDelta = Math.min(1, Math.max(0, ratio / 2)); // >=2x avg → 1.0
  }

  // ── 3. Origin/destination token overlap with driver's last delivery.
  let overlap = 0;
  if (lastLoad) {
    const loadTokens = new Set([
      ...tokenize(load.origin),
      ...tokenize(load.destination),
    ]);
    const lastTokens = new Set([
      ...tokenize(lastLoad.origin),
      ...tokenize(lastLoad.destination),
    ]);
    overlap = jaccard(loadTokens, lastTokens);
  }

  // Weighted combination.  Weights sum to 1.0 so the final score is [0..1].
  const score = 0.4 * freshness + 0.35 * rateDelta + 0.25 * overlap;

  return {
    score: Math.round(score * 1000) / 1000,
    breakdown: {
      freshness: Math.round(freshness * 1000) / 1000,
      rateDelta: Math.round(rateDelta * 1000) / 1000,
      overlap: Math.round(overlap * 1000) / 1000,
    },
  };
}

/**
 * Rank a list of loads for a driver.  Returns a new array (original not
 * mutated) of `{ load, score, breakdown }` sorted by score desc.
 */
export async function rankLoadsForDriver(loads, driverId) {
  if (!Array.isArray(loads) || loads.length === 0) return [];
  const avgByTruckType = await getAverageFreightByTruckType();

  let lastLoad = null;
  if (driverId && mongoose.Types.ObjectId.isValid(driverId)) {
    lastLoad = await Load.findOne({
      assignedDriver: new mongoose.Types.ObjectId(String(driverId)),
      status: 'delivered',
    }).sort({ createdAt: -1 }).select('origin destination').lean();
  }

  const scored = loads.map((load) => {
    const { score, breakdown } = scoreLoad(load, { avgByTruckType, lastLoad });
    return { load, score, breakdown };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Rank a list of drivers for a specific load.  Drivers with higher average
 * ratings and more recent activity rank higher.  `drivers` is an array of
 * User documents (lean).  Returns `{ driver, score, breakdown }`.
 */
export async function rankDriversForLoad(drivers, load) {
  if (!Array.isArray(drivers) || drivers.length === 0) return [];

  // Pull rating summaries in parallel.
  const ratings = await Promise.all(drivers.map((d) => getDriverRating(d._id)));
  // Pull each driver's most recent delivered load for overlap scoring.
  const lastLoads = await Promise.all(drivers.map((d) =>
    mongoose.Types.ObjectId.isValid(d._id)
      ? Load.findOne({
        assignedDriver: new mongoose.Types.ObjectId(String(d._id)),
        status: 'delivered',
      }).sort({ createdAt: -1 }).select('origin destination').lean()
      : null
  ));

  const loadTokens = new Set([
    ...tokenize(load.origin),
    ...tokenize(load.destination),
  ]);

  const scored = drivers.map((driver, i) => {
    const rating = ratings[i];
    const lastLoad = lastLoads[i];

    // Rating score (0..1): 5 stars = 1.0, 0 = 0.  Unrated drivers get 0.5
    // so they aren't buried below 1-star drivers.
    const ratingScore = rating ? Math.min(1, rating.avgStars / 5) : 0.5;

    // Overlap between driver's last delivery and this load.
    let overlap = 0;
    if (lastLoad) {
      const lastTokens = new Set([
        ...tokenize(lastLoad.origin),
        ...tokenize(lastLoad.destination),
      ]);
      overlap = jaccard(loadTokens, lastTokens);
    }

    // Recency: driver with a delivery in the last 30 days scores higher.
    let recency = 0;
    if (lastLoad?.createdAt) {
      const ageDays = (Date.now() - new Date(lastLoad.createdAt).getTime()) / (24 * 60 * 60 * 1000);
      recency = Math.max(0, 1 - ageDays / 30);
    }

    const score = 0.5 * ratingScore + 0.3 * overlap + 0.2 * recency;

    return {
      driver,
      score: Math.round(score * 1000) / 1000,
      breakdown: {
        ratingScore: Math.round(ratingScore * 1000) / 1000,
        overlap: Math.round(overlap * 1000) / 1000,
        recency: Math.round(recency * 1000) / 1000,
        ratingCount: rating?.count || 0,
        avgStars: rating ? Math.round(rating.avgStars * 10) / 10 : null,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
