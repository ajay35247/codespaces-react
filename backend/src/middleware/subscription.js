import Payment from '../schemas/PaymentSchema.js';
import User from '../schemas/UserSchema.js';

/**
 * Subscription entitlement helpers.
 *
 * The platform sells three tiers (basic / growth / enterprise) via Razorpay in
 * `routes/payments.js`. A successful payment produces a `Payment` document with
 * `planId` set and `status` in {`captured`, `success`}. We treat a subscription
 * as active when such a payment exists and the 30-day billing window from its
 * creation date has not yet elapsed.
 *
 * In addition, every public user is entitled to a one-time 15-day free trial
 * (User.trial.endsAt). While the trial window is active, the user is treated
 * as having a `basic` subscription so the gating middleware lets them try
 * advanced features. After the trial expires, normal 402 gating resumes
 * unless they have purchased a paid plan.
 *
 * Advanced features (placing bids, wallet withdrawals, AI matching triggers)
 * are gated behind {@link requireActiveSubscription}. Free users can still
 * register, browse loads, post loads, and accept bids on their own loads.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS  = 365 * 24 * 60 * 60 * 1000;
export const PUBLIC_TRIAL_DAYS = 15;
export const PUBLIC_TRIAL_MS   = PUBLIC_TRIAL_DAYS * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['captured', 'success'];

/**
 * 4-tier plan model (free / basic / standard / premium).
 *
 * Negative numeric limits (-1) mean "unlimited" — the frontend treats any
 * negative value as Unlimited. Daily limits are enforced by
 * middleware/quotas.js using UsageCounter (IST day).
 *
 * Legacy plan codes `growth` and `enterprise` from the previous 3-tier
 * model are kept as aliases (see PLAN_ALIASES) so any historical Payment
 * documents (and any in-flight gating calls) still resolve. New code
 * should always use the canonical codes below.
 */
const PLAN_FEATURES = {
  free: {
    loadsPerDay: 3,
    bidsPerDay: 5,
    maxBidsPerMonth: 5 * 30, // derived; kept for back-compat with old callers
    walletWithdrawals: false,
    aiMatching: false,
    advancedAnalytics: false,
    prioritySupport: false,
    priorityVisibility: false,
    fastMatching: false,
    premiumBadge: false,
    adsEnabled: true,
    supportSla: 'community',
  },
  basic: {
    loadsPerDay: 10,
    bidsPerDay: 20,
    maxBidsPerMonth: 20 * 30,
    walletWithdrawals: true,
    aiMatching: false,
    advancedAnalytics: false,
    prioritySupport: false,
    priorityVisibility: false,
    fastMatching: false,
    premiumBadge: false,
    adsEnabled: false,
    supportSla: 'email',
  },
  standard: {
    loadsPerDay: 25,
    bidsPerDay: 50,
    maxBidsPerMonth: 50 * 30,
    walletWithdrawals: true,
    aiMatching: true,
    advancedAnalytics: true,
    prioritySupport: false,
    // Spec: Standard explicitly excludes priority visibility / badge / fast
    // matching — these are the loss-aversion levers on the pricing page.
    priorityVisibility: false,
    fastMatching: false,
    premiumBadge: false,
    adsEnabled: false,
    supportSla: 'email',
  },
  premium: {
    loadsPerDay: -1, // unlimited
    bidsPerDay: -1,
    maxBidsPerMonth: -1,
    walletWithdrawals: true,
    aiMatching: true,
    advancedAnalytics: true,
    prioritySupport: true,
    priorityVisibility: true,
    fastMatching: true,
    premiumBadge: true,
    adsEnabled: false,
    supportSla: 'priority',
  },
};

// Map legacy (3-tier) codes onto the new canonical codes so old Payment
// rows and any unmigrated `requireActiveSubscription('growth')` calls keep
// working. Always normalise through resolvePlanCode() before lookup.
const PLAN_ALIASES = {
  growth: 'standard',
  enterprise: 'premium',
};

export function resolvePlanCode(planId) {
  const code = String(planId || '').trim();
  if (!code) return 'free';
  if (PLAN_FEATURES[code]) return code;
  if (PLAN_ALIASES[code]) return PLAN_ALIASES[code];
  return 'free';
}

const PLAN_RANK = { free: 0, basic: 1, standard: 2, premium: 3 };

/**
 * Returns the next plan up from the given planId.  Used by the upgrade
 * trigger system so the 402 / 429 / suggestion responses can name a
 * concrete plan to nudge the user toward.  Premium has no plan above it,
 * so we fall back to recommending Premium itself (the modal copy still
 * works — "stay on Premium" is rendered as "Premium" without an upgrade
 * CTA on the client).
 */
export function nextPlanUp(planId) {
  const code = resolvePlanCode(planId);
  const order = ['free', 'basic', 'standard', 'premium'];
  const idx = order.indexOf(code);
  if (idx < 0) return 'premium';
  return order[Math.min(idx + 1, order.length - 1)];
}

// Public catalogue prices used to attach a `suggestedPlan` block to upgrade
// responses.  Mirrors PLAN_CATALOGUE in routes/payments.js — kept here as
// a static fallback so middleware doesn't import the route file (would
// create a cycle).  Prices are admin-tunable via SubscriptionPlan in a
// future iteration; today they are the canonical defaults of the public
// pricing page.
const SUGGESTED_PLAN_PRICES = Object.freeze({
  free:     { name: 'Free',     monthlyPrice: 0,   yearlyPrice: 0    },
  basic:    { name: 'Basic',    monthlyPrice: 99,  yearlyPrice: 999  },
  standard: { name: 'Standard', monthlyPrice: 199, yearlyPrice: 1999 },
  premium:  { name: 'Premium',  monthlyPrice: 299, yearlyPrice: 2999 },
});

/**
 * Build the standard upgrade hint payload that the frontend uses to render
 * the upgrade modal.  Always returns the same shape regardless of trigger
 * so the frontend listener (apiFetch → window.dispatchEvent('upgrade:required'))
 * can render uniformly.
 *
 * @param {string} trigger    LIMIT_HIT | SUBSCRIPTION_REQUIRED | UPGRADE_REQUIRED | HIGH_USAGE | PRICING_VIEW
 * @param {string} fromPlan   user's current plan code (free|basic|standard|premium)
 * @param {string} [overrideTo] explicit suggested plan; defaults to nextPlanUp(fromPlan)
 * @param {string} [message]  human-readable copy override
 * @param {object} [meta]     optional structured payload (action, limit, used, ...)
 */
export function buildUpgradeHint({ trigger, fromPlan = 'free', overrideTo, message, meta }) {
  const fromCode = resolvePlanCode(fromPlan);
  const toCode = overrideTo
    ? resolvePlanCode(overrideTo)
    : nextPlanUp(fromCode);
  const suggested = SUGGESTED_PLAN_PRICES[toCode] || SUGGESTED_PLAN_PRICES.premium;
  const defaultCopy = (() => {
    switch (trigger) {
      case 'LIMIT_HIT':
        return `You've hit today's limit on ${fromCode}. Upgrade to ${suggested.name} to keep earning.`;
      case 'HIGH_USAGE':
        return `You've used most of today's ${fromCode} allowance. Upgrade to ${suggested.name} so you don't miss the next load.`;
      case 'SUBSCRIPTION_REQUIRED':
        return `An active subscription is required for this. Start with ${suggested.name} from ₹${suggested.monthlyPrice}/mo.`;
      case 'UPGRADE_REQUIRED':
        return `This feature is on ${suggested.name}. Upgrade for ₹${suggested.monthlyPrice}/mo to unlock it.`;
      case 'PRICING_VIEW':
        return `${suggested.name} is the best value — only about ₹${Math.max(1, Math.round(suggested.monthlyPrice / 30))}/day.`;
      default:
        return `Upgrade to ${suggested.name} to unlock more.`;
    }
  })();
  return {
    upgrade: true,
    trigger,
    fromPlan: fromCode,
    suggestedPlan: {
      code: toCode,
      name: suggested.name,
      monthlyPrice: suggested.monthlyPrice,
      yearlyPrice: suggested.yearlyPrice,
    },
    message: message || defaultCopy,
    meta: meta || null,
  };
}

/**
 * Returns the user's trial state.
 *   { state: 'never' | 'active' | 'expired', endsAt, daysLeft, planId }
 */
export async function getTrialStatus(userId) {
  if (!userId) return { state: 'never', endsAt: null, daysLeft: 0, planId: null };
  const user = await User.findById(userId).select('trial').lean();
  const trial = user?.trial;
  if (!trial?.startedAt || !trial?.endsAt) {
    return { state: 'never', endsAt: null, daysLeft: 0, planId: null };
  }
  const endsAt = new Date(trial.endsAt).getTime();
  if (Number.isNaN(endsAt) || endsAt <= Date.now()) {
    return { state: 'expired', endsAt: trial.endsAt, daysLeft: 0, planId: resolvePlanCode(trial.planId) || 'basic' };
  }
  return {
    state: 'active',
    endsAt: trial.endsAt,
    daysLeft: Math.max(0, Math.ceil((endsAt - Date.now()) / (24 * 60 * 60 * 1000))),
    planId: resolvePlanCode(trial.planId) || 'basic',
  };
}

function syntheticFreeSubscription() {
  return {
    planId: 'free',
    amount: 0,
    currency: 'INR',
    status: 'free',
    createdAt: null,
    expiresAt: null,
    billingCycle: null,
    source: 'free',
    features: PLAN_FEATURES.free,
  };
}

/**
 * Returns the user's effective subscription. Resolution order:
 *   1. Latest paid Payment row whose billing window has not expired.
 *   2. Active 15-day trial → synthetic basic-tier sub (legacy onboarding path).
 *   3. Synthetic FREE sub — every authenticated user always has at least
 *      this one. The "everyone has a plan" invariant simplifies the rest
 *      of the system: callers can read `sub.features.loadsPerDay` without
 *      a null check.
 */
export async function getActiveSubscription(userId) {
  if (!userId) return null;

  const payment = await Payment.findOne(
    {
      userId,
      planId: { $exists: true, $ne: null },
      status: { $in: ACTIVE_STATUSES },
    },
    null,
    { sort: { createdAt: -1 } }
  ).lean();

  if (payment) {
    const createdAt = payment.createdAt ? new Date(payment.createdAt).getTime() : 0;
    const cycle = payment.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const windowMs = cycle === 'yearly' ? YEAR_MS : MONTH_MS;
    const expiresAt = createdAt + windowMs;
    if (createdAt && expiresAt >= Date.now()) {
      const planId = resolvePlanCode(payment.planId);
      const features = PLAN_FEATURES[planId] || PLAN_FEATURES.free;
      return {
        planId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        expiresAt: new Date(expiresAt),
        billingCycle: cycle,
        source: 'paid',
        features,
      };
    }
  }

  // No active paid subscription — fall back to active trial if any.
  const trial = await getTrialStatus(userId);
  if (trial.state === 'active') {
    const planId = resolvePlanCode(trial.planId) || 'basic';
    return {
      planId,
      amount: 0,
      currency: 'INR',
      status: 'trial',
      createdAt: null,
      expiresAt: new Date(trial.endsAt),
      billingCycle: null,
      source: 'trial',
      features: PLAN_FEATURES[planId] || PLAN_FEATURES.basic,
    };
  }

  return syntheticFreeSubscription();
}

/**
 * Returns a feature descriptor for a user, including whether they have an
 * active subscription and which advanced feature keys are unlocked.
 *
 * `active` is true only for paid/trial subs — it intentionally remains
 * false for the synthetic free tier so existing UI paths that gate on
 * "is the user paying" do not light up for free users.
 */
export async function getSubscriptionFeatures(userId) {
  const active = await getActiveSubscription(userId);
  const isPaying = Boolean(active) && active.source !== 'free';
  return {
    active: isPaying,
    planId:    active?.planId || 'free',
    expiresAt: active?.expiresAt || null,
    source:    active?.source || 'free',
    billingCycle: active?.billingCycle || null,
    features:  active?.features || PLAN_FEATURES.free,
  };
}

/**
 * Middleware that rejects the request with HTTP 402 when the caller does not
 * have an active paid subscription. Callers can optionally require a minimum
 * tier (`basic` < `standard` < `premium`).
 *
 *   router.post('/bid', verifyJWT, requireActiveSubscription(), handler);
 *   router.post('/ai-match', verifyJWT, requireActiveSubscription('standard'), handler);
 *
 * Legacy minTier strings ('growth', 'enterprise') are accepted via
 * resolvePlanCode() and mapped to 'standard' / 'premium' respectively.
 */
export function requireActiveSubscription(minTier = 'basic') {
  const normalisedTier = resolvePlanCode(minTier) || 'basic';
  // We require a *paid* tier here; clamp 'free' callers up to 'basic' so the
  // gate keeps its previous semantics.
  const effectiveTier = normalisedTier === 'free' ? 'basic' : normalisedTier;
  const minRank = PLAN_RANK[effectiveTier] ?? 1;
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const sub = await getActiveSubscription(req.user.id);
      // Synthetic free sub does not satisfy a paid gate.
      if (!sub || sub.source === 'free') {
        return res.status(402).json({
          ...buildUpgradeHint({
            trigger: 'SUBSCRIPTION_REQUIRED',
            fromPlan: sub?.planId || 'free',
            overrideTo: effectiveTier,
          }),
          error: 'An active subscription is required to use this feature',
          code: 'SUBSCRIPTION_REQUIRED',
          minTier: effectiveTier,
        });
      }
      const currentRank = PLAN_RANK[sub.planId] ?? 0;
      if (currentRank < minRank) {
        return res.status(402).json({
          ...buildUpgradeHint({
            trigger: 'UPGRADE_REQUIRED',
            fromPlan: sub.planId,
            overrideTo: effectiveTier,
          }),
          error: `This feature requires the ${effectiveTier} plan or higher`,
          code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
          currentPlan: sub.planId,
          minTier: effectiveTier,
        });
      }
      req.subscription = sub;
      return next();
    } catch (error) {
      console.error('Subscription check error:', error.message);
      return res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}

export { PLAN_FEATURES, PLAN_RANK, PLAN_ALIASES };
