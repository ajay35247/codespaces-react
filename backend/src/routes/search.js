import { Router } from 'express';
import mongoose from 'mongoose';
import { Joi } from '../middleware/validation.js';
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
} from '../middleware/authorize.js';
import Load from '../schemas/LoadSchema.js';
import User from '../schemas/UserSchema.js';

const router = Router();

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_QUERY_LENGTH = 120;
const MAX_REGEX_QUERY_LENGTH = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SUGGEST_LIMIT = 8;

const ALLOWED_SORTS = new Set(['latest', 'price_desc', 'nearest']);
const ALLOWED_LOAD_STATUSES = new Set(['posted', 'in-transit', 'delivered', 'cancelled']);

const searchQuerySchema = Joi.object({
  q: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
  from: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
  to: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
  vehicle: Joi.string().trim().allow('').max(80).optional(),
  loadType: Joi.string().trim().allow('').valid('', 'full', 'part').optional(),
  status: Joi.string()
    .trim()
    .allow('')
    .valid('', ...ALLOWED_LOAD_STATUSES)
    .optional(),
  minPrice: Joi.number().min(0).max(10_000_000).optional(),
  maxPrice: Joi.number().min(0).max(10_000_000).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  sort: Joi.string()
    .valid(...ALLOWED_SORTS)
    .default('latest')
    .optional(),
  page: Joi.number().integer().min(1).max(1000).default(1).optional(),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT).optional(),
}).unknown(false);

const suggestQuerySchema = Joi.object({
  q: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
}).unknown(false);

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Escape special regex characters to prevent regex injection / ReDoS. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Optional auth — populate req.user when a valid access token is present, but
 * do not reject the request when it is absent.  Used by the search endpoints
 * which are accessible to all visitors with role-aware filtering on top.
 */
function optionalAuth(req, _res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Invalid / expired tokens are simply ignored — caller is treated as
    // unauthenticated for the purpose of the search endpoint.
  }
  return next();
}

/**
 * Build the role-aware base filter that applies to every /search query.
 * Mirrors the visibility rules used by routes/loads.js so search never
 * leaks loads that the caller could not otherwise see.
 */
function buildRoleFilter(user) {
  if (!user) {
    // Unauthenticated visitors can browse the public marketplace of open
    // (posted) loads only — same shape as the public GET /loads endpoint.
    return { status: 'posted' };
  }

  if (user.role === 'admin') {
    return {};
  }

  if (user.role === 'shipper') {
    // Shippers see their own loads (any status) + the open marketplace.
    return {
      $or: [{ postedBy: new mongoose.Types.ObjectId(user.id) }, { status: 'posted' }],
    };
  }

  // Drivers, truck owners, and brokers see the open marketplace.
  return { status: 'posted' };
}

/** Normalise a Joi-validated query object into a Mongo filter document. */
function buildSearchFilter(query, user) {
  const filter = { ...buildRoleFilter(user) };
  const and = [];

  if (query.from) {
    and.push({ origin: new RegExp(escapeRegex(query.from), 'i') });
  }
  if (query.to) {
    and.push({ destination: new RegExp(escapeRegex(query.to), 'i') });
  }
  if (query.vehicle) {
    and.push({ truckType: new RegExp(escapeRegex(query.vehicle), 'i') });
  }
  if (query.status) {
    // Caller-specified status overrides the role-default status (still
    // bounded by the role $or above for shippers).
    filter.status = query.status;
  }
  if (typeof query.minPrice === 'number' || typeof query.maxPrice === 'number') {
    const range = {};
    if (typeof query.minPrice === 'number') range.$gte = query.minPrice;
    if (typeof query.maxPrice === 'number') range.$lte = query.maxPrice;
    filter.freightPrice = range;
  }
  if (query.dateFrom || query.dateTo) {
    const range = {};
    if (query.dateFrom) range.$gte = new Date(query.dateFrom);
    if (query.dateTo) range.$lte = new Date(query.dateTo);
    filter.pickupDate = range;
  }

  if (and.length > 0) {
    filter.$and = and;
  }
  return filter;
}

/**
 * Build the text/regex search component.  We try `$text` first (uses the
 * compound text index added on LoadSchema), and fall back to a small set of
 * anchored case-insensitive regex matches for short queries (<3 chars) where
 * `$text` typically returns no useful results.
 */
function applyQueryString(filter, q) {
  const trimmed = (q || '').trim();
  if (!trimmed) return { filter, useTextScore: false };

  if (trimmed.length >= 3) {
    return {
      filter: { ...filter, $text: { $search: trimmed, $diacriticSensitive: false } },
      useTextScore: true,
    };
  }

  // Cap regex fallback length defensively — Joi already enforces the upper
  // bound but this keeps the regex layer self-contained.
  const safe = escapeRegex(trimmed.slice(0, MAX_REGEX_QUERY_LENGTH));
  const re = new RegExp(safe, 'i');
  return {
    filter: {
      ...filter,
      $or: [
        { loadId: re },
        { origin: re },
        { destination: re },
        { truckType: re },
      ],
    },
    useTextScore: false,
  };
}

function buildSort(sortKey, useTextScore) {
  if (sortKey === 'price_desc') {
    return { freightPrice: -1, createdAt: -1 };
  }
  if (sortKey === 'nearest') {
    // Geo-nearest is a Phase 3 enhancement — until lat/lng search params are
    // wired through, fall back to "latest" so the sort key never silently
    // returns a bad ordering.
    return { createdAt: -1 };
  }
  if (useTextScore) {
    return { score: { $meta: 'textScore' }, createdAt: -1 };
  }
  return { createdAt: -1 };
}

/**
 * Hydrate `postedBy` into a small public-safe object so the search results
 * can render a poster role badge without a second round-trip.
 */
async function hydratePosters(loads) {
  const posterIds = Array.from(
    new Set(
      loads
        .map((l) => l.postedBy && String(l.postedBy))
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    )
  );
  if (posterIds.length === 0) return loads;

  const posters = await User.find(
    { _id: { $in: posterIds } },
    { name: 1, role: 1 }
  ).lean();
  const byId = new Map(posters.map((p) => [String(p._id), p]));

  return loads.map((load) => {
    const poster = load.postedBy ? byId.get(String(load.postedBy)) : null;
    return {
      ...load,
      poster: poster
        ? { id: String(poster._id), name: poster.name || '', role: poster.role || '' }
        : null,
    };
  });
}

/** Project the public-safe shape of a load result. */
function projectLoad(load) {
  const topBid = Array.isArray(load.bids) && load.bids.length
    ? load.bids
        .filter((b) => b && typeof b.amount === 'number')
        .reduce(
          (best, b) => (best == null || b.amount > best.amount ? b : best),
          null
        )
    : null;

  return {
    id: String(load._id),
    loadId: load.loadId,
    origin: load.origin,
    destination: load.destination,
    weight: load.weight,
    truckType: load.truckType,
    status: load.status,
    freightPrice: load.freightPrice ?? null,
    pickupDate: load.pickupDate || null,
    dropDate: load.dropDate || null,
    postedByRole: load.postedByRole || null,
    poster: load.poster || null,
    topBid: topBid
      ? { amount: topBid.amount, currency: topBid.currency || 'INR', status: topBid.status }
      : null,
    bidCount: Array.isArray(load.bids) ? load.bids.length : 0,
    createdAt: load.createdAt,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/search
 *
 * Universal search across loads/routes/locations.  Role-aware:
 *  - admin                       → every load
 *  - shipper                     → their own posts + open marketplace
 *  - driver/broker/truck_owner   → open marketplace
 *  - unauthenticated             → open marketplace
 */
router.get('/', optionalAuth, async (req, res) => {
  const { error, value } = searchQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return res.status(400).json({
      error: 'Invalid search parameters',
      details: error.details.map((d) => ({ message: d.message, path: d.path.join('.') })),
    });
  }

  if (
    typeof value.minPrice === 'number'
    && typeof value.maxPrice === 'number'
    && value.minPrice > value.maxPrice
  ) {
    return res.status(400).json({ error: 'minPrice must be <= maxPrice' });
  }

  const page = value.page || 1;
  const limit = value.limit || DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  try {
    const baseFilter = buildSearchFilter(value, req.user);
    const { filter, useTextScore } = applyQueryString(baseFilter, value.q);
    const sort = buildSort(value.sort || 'latest', useTextScore);

    const projection = useTextScore ? { score: { $meta: 'textScore' } } : {};

    const [docs, total] = await Promise.all([
      Load.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
      Load.countDocuments(filter),
    ]);

    const hydrated = await hydratePosters(docs);
    const results = hydrated.map(projectLoad);

    return res.json({
      results,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 0,
      },
      query: {
        q: value.q || '',
        from: value.from || '',
        to: value.to || '',
        vehicle: value.vehicle || '',
        sort: value.sort || 'latest',
      },
    });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/search/suggest
 *
 * Lightweight type-ahead suggestions sourced from distinct origin /
 * destination / loadId matches in the visible load set.  Capped at
 * SUGGEST_LIMIT entries — UI is expected to debounce calls (~200 ms).
 */
router.get('/suggest', optionalAuth, async (req, res) => {
  const { error, value } = suggestQuerySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return res.status(400).json({ error: 'Invalid suggest parameters' });
  }

  const q = (value.q || '').trim();
  if (q.length < 2) {
    return res.json({ suggestions: [] });
  }

  try {
    const baseFilter = buildRoleFilter(req.user);
    const safe = escapeRegex(q.slice(0, MAX_REGEX_QUERY_LENGTH));
    const re = new RegExp(`^${safe}`, 'i');

    const docs = await Load.find(
      {
        ...baseFilter,
        $or: [{ loadId: re }, { origin: re }, { destination: re }, { truckType: re }],
      },
      { loadId: 1, origin: 1, destination: 1, truckType: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(SUGGEST_LIMIT * 4)
      .lean();

    const seen = new Set();
    const suggestions = [];
    for (const d of docs) {
      const fields = [
        { type: 'loadId', value: d.loadId },
        { type: 'origin', value: d.origin },
        { type: 'destination', value: d.destination },
        { type: 'vehicle', value: d.truckType },
      ];
      for (const f of fields) {
        if (!f.value) continue;
        if (!new RegExp(`^${safe}`, 'i').test(String(f.value))) continue;
        const key = `${f.type}:${String(f.value).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        suggestions.push({ type: f.type, value: f.value });
        if (suggestions.length >= SUGGEST_LIMIT) break;
      }
      if (suggestions.length >= SUGGEST_LIMIT) break;
    }

    return res.json({ suggestions });
  } catch (err) {
    console.error('Suggest error:', err.message);
    return res.status(500).json({ error: 'Suggest failed' });
  }
});

export default router;

// Exported for unit tests — not part of the public HTTP surface.
export const __testables = {
  buildRoleFilter,
  buildSearchFilter,
  applyQueryString,
  buildSort,
  searchQuerySchema,
  escapeRegex,
};
