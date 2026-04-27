import { Router } from 'express';
import mongoose from 'mongoose';
import { Joi } from '../middleware/validation.js';
import {
  getAccessTokenFromRequest,
  verifyAccessToken,
  verifyJWT,
} from '../middleware/authorize.js';
import Load from '../schemas/LoadSchema.js';
import User from '../schemas/UserSchema.js';
import SavedSearch from '../schemas/SavedSearchSchema.js';
import SearchEvent from '../schemas/SearchEventSchema.js';
import AdminControlState from '../schemas/AdminControlStateSchema.js';
import {
  parseRouteQuery,
  normaliseLocation,
  deriveTags,
  medianPrice,
  rankLoads,
  SEARCH_CONFIG_DEFAULTS,
  sanitiseSearchConfig,
} from '../services/searchService.js';

const router = Router();

// ── Constants ───────────────────────────────────────────────────────────────
const MAX_QUERY_LENGTH = 120;
const MAX_REGEX_QUERY_LENGTH = 50;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SUGGEST_LIMIT = 8;
const TRENDING_WINDOW_DAYS = 7;
const TRENDING_LIMIT = 10;
const SAVED_SEARCH_LIMIT_PER_USER = 25;
const HISTORY_DEFAULT_LIMIT = 20;
const HISTORY_MAX_LIMIT = 50;
const SUGGEST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SUGGEST_CACHE_MAX_ENTRIES = 256;

const ALLOWED_SORTS = new Set(['latest', 'price_desc', 'nearest', 'relevance']);
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

const savedSearchBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  query: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
  filters: Joi.object().unknown(true).default({}),
}).unknown(false);

const eventBodySchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(64).required(),
  query: Joi.string().trim().allow('').max(MAX_QUERY_LENGTH).optional(),
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
    // Invalid / expired tokens are ignored — caller is treated as
    // unauthenticated for the purpose of the search endpoints.
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
    return { status: 'posted' };
  }
  if (user.role === 'admin') {
    return {};
  }
  if (user.role === 'shipper') {
    return {
      $or: [{ postedBy: new mongoose.Types.ObjectId(user.id) }, { status: 'posted' }],
    };
  }
  return { status: 'posted' };
}

/** Normalise a Joi-validated query object into a Mongo filter document. */
function buildSearchFilter(query, user) {
  const filter = { ...buildRoleFilter(user) };
  const and = [];

  if (query.from) and.push({ origin: new RegExp(escapeRegex(query.from), 'i') });
  if (query.to) and.push({ destination: new RegExp(escapeRegex(query.to), 'i') });
  if (query.vehicle) and.push({ truckType: new RegExp(escapeRegex(query.vehicle), 'i') });
  if (query.status) filter.status = query.status;

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

  if (and.length > 0) filter.$and = and;
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
  if (sortKey === 'price_desc') return { freightPrice: -1, createdAt: -1 };
  if (sortKey === 'nearest') return { createdAt: -1 }; // geo-distance is Phase 3+ — fall back to latest
  if (useTextScore || sortKey === 'relevance') {
    return { score: { $meta: 'textScore' }, createdAt: -1 };
  }
  return { createdAt: -1 };
}

/**
 * Hydrate `postedBy` into a small public-safe object so the search results
 * can render a poster role badge without a second round-trip.  Also
 * surfaces the poster's KYC status which is needed for the `verified` tag.
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
    { name: 1, role: 1, kycStatus: 1 }
  ).lean();
  const byId = new Map(posters.map((p) => [String(p._id), p]));

  return loads.map((load) => {
    const poster = load.postedBy ? byId.get(String(load.postedBy)) : null;
    return {
      ...load,
      poster: poster
        ? {
            id: String(poster._id),
            name: poster.name || '',
            role: poster.role || '',
            kycStatus: poster.kycStatus || 'pending',
          }
        : null,
    };
  });
}

/** Project the public-safe shape of a load result. */
function projectLoad(load, tags = []) {
  const topBid = Array.isArray(load.bids) && load.bids.length
    ? load.bids
        .filter((b) => b && typeof b.amount === 'number')
        .reduce((best, b) => (best == null || b.amount > best.amount ? b : best), null)
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
    poster: load.poster
      ? { id: load.poster.id, name: load.poster.name, role: load.poster.role }
      : null,
    topBid: topBid
      ? { amount: topBid.amount, currency: topBid.currency || 'INR', status: topBid.status }
      : null,
    bidCount: Array.isArray(load.bids) ? load.bids.length : 0,
    createdAt: load.createdAt,
    tags,
  };
}

// ── Admin search-config loader ──────────────────────────────────────────────
// Cached for 30 s so the public /search hot path doesn't take a Mongo round
// trip per request just to read the ranking weights.

let cachedSearchConfig = SEARCH_CONFIG_DEFAULTS;
let cachedSearchConfigAt = 0;

async function getSearchConfig() {
  if (Date.now() - cachedSearchConfigAt < 30_000) return cachedSearchConfig;
  try {
    const doc = await AdminControlState.findOne({ key: 'search-control' }).lean();
    cachedSearchConfig = sanitiseSearchConfig({ ...SEARCH_CONFIG_DEFAULTS, ...(doc?.value || {}) });
  } catch {
    cachedSearchConfig = SEARCH_CONFIG_DEFAULTS;
  }
  cachedSearchConfigAt = Date.now();
  return cachedSearchConfig;
}

export function invalidateSearchConfigCache() {
  cachedSearchConfigAt = 0;
}

// ── Tiny LRU cache for /suggest hot path ────────────────────────────────────
// Keyed by `${userId || 'anon'}|${q}` so a logged-in user with a different
// role doesn't see another user's role-filtered suggestions.

const suggestCache = new Map();

function suggestCacheGet(key) {
  const entry = suggestCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > SUGGEST_CACHE_TTL_MS) {
    suggestCache.delete(key);
    return null;
  }
  // Refresh recency.
  suggestCache.delete(key);
  suggestCache.set(key, entry);
  return entry.value;
}

function suggestCacheSet(key, value) {
  if (suggestCache.size >= SUGGEST_CACHE_MAX_ENTRIES) {
    // Evict the oldest entry (Map preserves insertion order).
    const firstKey = suggestCache.keys().next().value;
    if (firstKey !== undefined) suggestCache.delete(firstKey);
  }
  suggestCache.set(key, { value, at: Date.now() });
}

// ── Background SearchEvent logging ──────────────────────────────────────────
// Best-effort: failure must never break the user-facing /search response.

async function logSearchEvent({ user, query, fromNormalised, toNormalised, filters, resultsCount, clickedLoadId }) {
  try {
    await SearchEvent.create({
      userId: user?.id ? new mongoose.Types.ObjectId(user.id) : null,
      role: user?.role || null,
      query: String(query || '').slice(0, MAX_QUERY_LENGTH),
      fromNormalised: String(fromNormalised || '').slice(0, 80),
      toNormalised: String(toNormalised || '').slice(0, 80),
      filters: filters && typeof filters === 'object' ? filters : {},
      resultsCount: Number.isFinite(resultsCount) ? resultsCount : 0,
      clickedLoadId: clickedLoadId ? String(clickedLoadId).slice(0, 64) : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('logSearchEvent failed:', err.message);
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/search
 *
 * Universal search across loads/routes/locations.  Role-aware (admin: all;
 * shipper: own + posted; driver/broker/truck_owner/anon: posted only),
 * Joi-validated, paginated, and writes a SearchEvent for analytics.
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

  // Route parser: when the user typed "Delhi to Mumbai" we promote the
  // origin/destination into the structured `from` / `to` fields the rest
  // of the pipeline already understands.
  const routeShape = parseRouteQuery(value.q || '');
  if (routeShape.isRoute) {
    if (!value.from) value.from = routeShape.from;
    if (!value.to) value.to = routeShape.to;
    // Strip the route part of the q string so $text doesn't fight the
    // origin/destination regex; keep it only when there is something left.
    value.q = '';
  }

  const page = value.page || 1;
  const limit = value.limit || DEFAULT_LIMIT;
  const skip = (page - 1) * limit;

  try {
    const config = await getSearchConfig();

    const baseFilter = buildSearchFilter(value, req.user);
    const { filter, useTextScore } = applyQueryString(baseFilter, value.q);
    const sort = buildSort(value.sort || 'latest', useTextScore);
    const projection = useTextScore ? { score: { $meta: 'textScore' } } : {};

    const [docs, total] = await Promise.all([
      Load.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
      Load.countDocuments(filter),
    ]);

    const hydrated = await hydratePosters(docs);

    // Compute route median (for `high-paying` tag) only when we actually
    // know a route — avoids a wasted aggregation otherwise.
    let routeMedian = null;
    if (value.from && value.to && hydrated.length > 0) {
      try {
        // Fast path: median over the page itself.  Cheap and good enough.
        routeMedian = medianPrice(hydrated);
      } catch {
        routeMedian = null;
      }
    }

    // Apply admin ranking weights when the caller asked for relevance, or
    // when relevance was implicit because they typed text + sort=latest is
    // the default.  Latest/price_desc keep their explicit Mongo sort.
    let ordered = hydrated.map((load) => ({ load, textScore: load.score || 0 }));
    if (useTextScore && (value.sort === 'relevance' || value.sort === 'latest')) {
      ordered = rankLoads(ordered, config);
    }

    const sponsoredLoadIds = Array.isArray(config.sponsoredLoadIds) ? config.sponsoredLoadIds : [];
    const now = Date.now();

    const results = ordered.map(({ load }) => {
      const tags = deriveTags({
        load,
        posterKycStatus: load.poster?.kycStatus,
        routeMedianPrice: routeMedian,
        sponsoredLoadIds,
        now,
      });
      return projectLoad(load, tags);
    });

    // Best-effort analytics — fire-and-forget.
    logSearchEvent({
      user: req.user,
      query: value.q,
      fromNormalised: normaliseLocation(value.from),
      toNormalised: normaliseLocation(value.to),
      filters: {
        vehicle: value.vehicle || '',
        status: value.status || '',
        minPrice: value.minPrice ?? null,
        maxPrice: value.maxPrice ?? null,
        sort: value.sort || 'latest',
      },
      resultsCount: total,
    });

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
      // Surface the visible filter set so the UI knows which chips to render.
      filtersEnabled: config.filters,
    });
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/search/suggest
 *
 * Lightweight type-ahead suggestions.  Cached in-memory for 5 minutes per
 * `(userId, q)` pair to keep typing latency low.
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
  if (q.length < 2) return res.json({ suggestions: [] });

  const cacheKey = `${req.user?.id || 'anon'}|${q.toLowerCase()}`;
  const cached = suggestCacheGet(cacheKey);
  if (cached) return res.json({ suggestions: cached, cached: true });

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

    suggestCacheSet(cacheKey, suggestions);
    return res.json({ suggestions });
  } catch (err) {
    console.error('Suggest error:', err.message);
    return res.status(500).json({ error: 'Suggest failed' });
  }
});

/**
 * GET /api/search/trending
 *
 * Top origin → destination pairs over the last 7 days.  Aggregated from
 * `SearchEvent` so the more people search a route the higher it climbs.
 * Public endpoint — no PII surfaced.
 */
router.get('/trending', async (_req, res) => {
  try {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await SearchEvent.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          fromNormalised: { $ne: '' },
          toNormalised: { $ne: '' },
        },
      },
      {
        $group: {
          _id: { from: '$fromNormalised', to: '$toNormalised' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: TRENDING_LIMIT },
    ]);

    const trending = rows.map((r) => ({
      from: r._id.from,
      to: r._id.to,
      count: r.count,
    }));
    return res.json({ trending, windowDays: TRENDING_WINDOW_DAYS });
  } catch (err) {
    console.error('Trending error:', err.message);
    return res.status(500).json({ error: 'Trending fetch failed' });
  }
});

/**
 * POST /api/search/event
 *
 * Records a result-click event so we can power "recently viewed" and
 * personalised suggestions.  Auth-required so anonymous traffic cannot
 * spam-pollute the analytics store.
 */
router.post('/event', verifyJWT, async (req, res) => {
  const { error, value } = eventBodySchema.validate(req.body, { stripUnknown: true });
  if (error) return res.status(400).json({ error: 'Invalid event payload' });
  try {
    await logSearchEvent({
      user: req.user,
      query: value.query,
      filters: {},
      resultsCount: 0,
      clickedLoadId: value.loadId,
    });
    return res.status(204).end();
  } catch (err) {
    console.error('Search event error:', err.message);
    return res.status(500).json({ error: 'Failed to log event' });
  }
});

// ── Saved searches ──────────────────────────────────────────────────────────

router.get('/saved', verifyJWT, async (req, res) => {
  try {
    const docs = await SavedSearch.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .limit(SAVED_SEARCH_LIMIT_PER_USER)
      .lean();
    return res.json({
      saved: docs.map((d) => ({
        id: String(d._id),
        name: d.name,
        query: d.query || '',
        filters: d.filters || {},
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
    });
  } catch (err) {
    console.error('Saved search list error:', err.message);
    return res.status(500).json({ error: 'Failed to list saved searches' });
  }
});

router.post('/saved', verifyJWT, async (req, res) => {
  const { error, value } = savedSearchBodySchema.validate(req.body, { stripUnknown: true });
  if (error) return res.status(400).json({ error: 'Invalid saved search payload' });
  try {
    const count = await SavedSearch.countDocuments({ userId: req.user.id });
    if (count >= SAVED_SEARCH_LIMIT_PER_USER) {
      return res.status(409).json({ error: `Saved search limit reached (${SAVED_SEARCH_LIMIT_PER_USER})` });
    }
    const doc = await SavedSearch.findOneAndUpdate(
      { userId: req.user.id, name: value.name },
      {
        $set: {
          userId: req.user.id,
          name: value.name,
          query: value.query || '',
          filters: value.filters || {},
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json({
      saved: {
        id: String(doc._id),
        name: doc.name,
        query: doc.query || '',
        filters: doc.filters || {},
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'A saved search with that name already exists' });
    }
    console.error('Saved search create error:', err.message);
    return res.status(500).json({ error: 'Failed to save search' });
  }
});

router.delete('/saved/:id', verifyJWT, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid saved search id' });
  }
  try {
    const result = await SavedSearch.deleteOne({ _id: req.params.id, userId: req.user.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Saved search not found' });
    return res.status(204).end();
  } catch (err) {
    console.error('Saved search delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete saved search' });
  }
});

// ── History ─────────────────────────────────────────────────────────────────

router.get('/history', verifyJWT, async (req, res) => {
  const limit = Math.min(
    HISTORY_MAX_LIMIT,
    Math.max(1, parseInt(String(req.query.limit || HISTORY_DEFAULT_LIMIT), 10) || HISTORY_DEFAULT_LIMIT)
  );
  try {
    const events = await SearchEvent.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Deduplicate by (query, from, to) — surfacing the most recent.
    const seen = new Set();
    const history = [];
    for (const e of events) {
      const key = `${e.query || ''}|${e.fromNormalised || ''}|${e.toNormalised || ''}|${e.clickedLoadId || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      history.push({
        id: String(e._id),
        query: e.query || '',
        from: e.fromNormalised || '',
        to: e.toNormalised || '',
        clickedLoadId: e.clickedLoadId || null,
        resultsCount: e.resultsCount || 0,
        createdAt: e.createdAt,
      });
    }
    return res.json({ history });
  } catch (err) {
    console.error('History fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch history' });
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
  savedSearchBodySchema,
  eventBodySchema,
  escapeRegex,
};
