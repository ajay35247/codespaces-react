import Payment from '../schemas/PaymentSchema.js';

/**
 * Subscription entitlement helpers.
 *
 * The platform sells three tiers (basic / growth / enterprise) via Razorpay in
 * `routes/payments.js`. A successful payment produces a `Payment` document with
 * `planId` set and `status` in {`captured`, `success`}. We treat a subscription
 * as active when such a payment exists and the 30-day billing window from its
 * creation date has not yet elapsed.
 *
 * Advanced features (placing bids, wallet withdrawals, AI matching triggers)
 * are gated behind {@link requireActiveSubscription}. Free users can still
 * register, browse loads, post loads, and accept bids on their own loads.
 */

const SUBSCRIPTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['captured', 'success'];

const PLAN_FEATURES = {
  basic: {
    maxBidsPerMonth: 20,
    walletWithdrawals: true,
    aiMatching: false,
    advancedAnalytics: false,
    prioritySupport: false,
  },
  growth: {
    maxBidsPerMonth: 100,
    walletWithdrawals: true,
    aiMatching: true,
    advancedAnalytics: true,
    prioritySupport: false,
  },
  enterprise: {
    // -1 is used as a sentinel for "unlimited" so the descriptor serialises
    // cleanly over JSON (`Infinity` becomes `null` during JSON.stringify).
    // The frontend interprets any negative number as Unlimited.
    maxBidsPerMonth: -1,
    walletWithdrawals: true,
    aiMatching: true,
    advancedAnalytics: true,
    prioritySupport: true,
  },
};

const PLAN_RANK = { basic: 1, growth: 2, enterprise: 3 };

/**
 * Returns the latest active paid subscription for a user, or `null`.
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

  if (!payment) return null;

  const createdAt = payment.createdAt ? new Date(payment.createdAt).getTime() : 0;
  const expiresAt = createdAt + SUBSCRIPTION_WINDOW_MS;
  if (!createdAt || expiresAt < Date.now()) {
    return null;
  }

  const planId = String(payment.planId);
  const features = PLAN_FEATURES[planId] || PLAN_FEATURES.basic;

  return {
    planId,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    expiresAt: new Date(expiresAt),
    features,
  };
}

/**
 * Returns a feature descriptor for a user, including whether they have an
 * active subscription and which advanced feature keys are unlocked.
 */
export async function getSubscriptionFeatures(userId) {
  const active = await getActiveSubscription(userId);
  return {
    active: Boolean(active),
    planId: active?.planId || null,
    expiresAt: active?.expiresAt || null,
    features: active?.features || {
      maxBidsPerMonth: 0,
      walletWithdrawals: false,
      aiMatching: false,
      advancedAnalytics: false,
      prioritySupport: false,
    },
  };
}

/**
 * Middleware that rejects the request with HTTP 402 when the caller does not
 * have an active paid subscription. Callers can optionally require a minimum
 * tier (`basic` < `growth` < `enterprise`).
 *
 *   router.post('/bid', verifyJWT, requireActiveSubscription(), handler);
 *   router.post('/ai-match', verifyJWT, requireActiveSubscription('growth'), handler);
 */
export function requireActiveSubscription(minTier = 'basic') {
  const minRank = PLAN_RANK[minTier] || 1;
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const sub = await getActiveSubscription(req.user.id);
      if (!sub) {
        return res.status(402).json({
          error: 'An active subscription is required to use this feature',
          code: 'SUBSCRIPTION_REQUIRED',
          minTier,
        });
      }
      const currentRank = PLAN_RANK[sub.planId] || 0;
      if (currentRank < minRank) {
        return res.status(402).json({
          error: `This feature requires the ${minTier} plan or higher`,
          code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
          currentPlan: sub.planId,
          minTier,
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

export { PLAN_FEATURES };
