import crypto from 'crypto';
import Experiment from '../schemas/ExperimentSchema.js';

/**
 * Lightweight A/B testing service.
 *
 * Bucketing strategy: deterministic SHA-256 of `{userId}:{experimentKey}`
 * folded onto a 0..1 float, then mapped onto the cumulative weights of the
 * experiment's variants.  Same user → same arm without any per-user state,
 * so we never have a write on the read path.
 *
 * The runtime cache (RUN_CACHE) avoids hitting Mongo for every /pricing
 * request.  It is invalidated by `invalidateExperimentCache()` from the
 * admin write endpoints.
 */

const RUN_CACHE = new Map(); // planCode -> { expiresAt, experiment | null }
const CACHE_TTL_MS = 30 * 1000;

export function invalidateExperimentCache() {
  RUN_CACHE.clear();
}

async function loadRunningExperiment(planCode) {
  const cached = RUN_CACHE.get(planCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.experiment;
  }
  const exp = await Experiment.findOne({ planCode, status: 'running' }).lean();
  RUN_CACHE.set(planCode, { expiresAt: Date.now() + CACHE_TTL_MS, experiment: exp || null });
  return exp || null;
}

/**
 * Pick a variant for the given user using the experiment's weights.
 * Returns the variant subdoc or null when there is no running experiment.
 *
 * The bucket is computed deterministically; tests can pass an explicit
 * `salt` (e.g. anonymous browse mode) but in production the userId is the
 * salt so the same user always sees the same price.
 */
export function pickVariant(experiment, userIdOrSalt) {
  if (!experiment || !Array.isArray(experiment.variants) || experiment.variants.length === 0) {
    return null;
  }
  const totalWeight = experiment.variants.reduce((sum, v) => sum + Math.max(1, Number(v.weight) || 0), 0);
  if (totalWeight <= 0) return experiment.variants[0];

  const hash = crypto
    .createHash('sha256')
    .update(`${String(userIdOrSalt || 'anon')}:${experiment.key}`)
    .digest();
  // Use the first 4 bytes as an unsigned int → fold to [0, 1).
  const intval = hash.readUInt32BE(0);
  const point = (intval % totalWeight);

  let cursor = 0;
  for (const variant of experiment.variants) {
    cursor += Math.max(1, Number(variant.weight) || 0);
    if (point < cursor) return variant;
  }
  // Fallback: last variant (should be unreachable given the loop above).
  return experiment.variants[experiment.variants.length - 1];
}

/**
 * Resolve the price overrides a given user should see for a plan, given any
 * running experiment.  Returns:
 *   {
 *     monthly: number | null,      // override or null = no change
 *     yearly:  number | null,
 *     experiment: { key, variantId, label } | null,
 *   }
 */
export async function resolveExperimentForUser({ planCode, userId }) {
  const exp = await loadRunningExperiment(planCode);
  if (!exp) {
    return { monthly: null, yearly: null, experiment: null };
  }
  const variant = pickVariant(exp, userId);
  if (!variant) {
    return { monthly: null, yearly: null, experiment: null };
  }
  return {
    monthly: typeof variant.monthlyPrice === 'number' ? variant.monthlyPrice : null,
    yearly:  typeof variant.yearlyPrice  === 'number' ? variant.yearlyPrice  : null,
    experiment: {
      key: exp.key,
      variantId: variant.id,
      label: variant.label || variant.id,
    },
  };
}

/**
 * Atomic +1 on impressions for the chosen variant.  Best-effort; the read
 * path must NEVER be blocked by a metrics write.  The underlying matched
 * arrayFilters update is idempotent for a missing variant id.
 */
export async function recordImpression({ experimentKey, variantId }) {
  if (!experimentKey || !variantId) return;
  try {
    await Experiment.updateOne(
      { key: experimentKey, status: 'running' },
      { $inc: { 'variants.$[v].impressions': 1 } },
      { arrayFilters: [{ 'v.id': variantId }] }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('experiments.recordImpression failed:', err.message);
  }
}

/**
 * Atomic +1 on conversions for the chosen variant.  Called from the
 * Razorpay verify path after a successful subscription purchase.  We do
 * not require status='running' here so a winner can still record stragglers.
 */
export async function recordConversion({ experimentKey, variantId }) {
  if (!experimentKey || !variantId) return;
  try {
    await Experiment.updateOne(
      { key: experimentKey },
      { $inc: { 'variants.$[v].conversions': 1 } },
      { arrayFilters: [{ 'v.id': variantId }] }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('experiments.recordConversion failed:', err.message);
  }
}
