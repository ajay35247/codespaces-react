import Offer from '../schemas/OfferSchema.js';
import { getPlatformState } from '../middleware/platformControl.js';

/**
 * Resolve the effective price for a (planCode, originalPrice) pair at a point
 * in time, applying admin-managed offers from the Offer collection.
 *
 * This is the **single source of truth** for "what does the user pay".
 * Both the user-facing `/payments/pricing` listing and the server-side
 * `/payments/subscribe` order creation must call this function so that
 * a malicious client cannot pass a fake discounted price.
 *
 * Selection rules
 *   1. If the platform `offersPaused` kill-switch is on → no offer applies.
 *   2. Auto offers (type 'festival' | 'flat') must satisfy:
 *        enabled && startsAt <= now < endsAt
 *        && (no usageLimit OR usageCount < usageLimit)
 *        && (no plan filter OR planCode is in appliesToPlanCodes)
 *   3. If a `couponCode` is provided AND a matching, valid coupon offer
 *      exists, the coupon takes precedence over auto offers (admin intent:
 *      "coupon users get the best rate they redeemed").
 *   4. Among multiple eligible auto offers, the one with the HIGHEST
 *      discountPercent wins (best deal for the user; deterministic).
 *
 * The function never mutates the Offer document. Usage counts are bumped
 * separately on actual purchase (in payments.js).
 *
 * @param {object}   args
 * @param {string}   args.planCode      Plan code (e.g. 'basic').
 * @param {number}   args.originalPrice Original price in INR (rupees).
 * @param {string}  [args.couponCode]   Optional coupon entered by the user.
 * @param {Date}    [args.now]          Defaults to current time. Useful for tests.
 * @param {boolean} [args.skipKillSwitch] When true, skip the offersPaused check
 *                                        (used by admin preview endpoints).
 * @returns {Promise<{
 *   originalPrice: number,
 *   finalPrice: number,
 *   discountPercent: number,
 *   appliedOffer: null | { id: string, name: string, type: string, label: string,
 *                          discountPercent: number, couponCode?: string }
 * }>}
 */
export async function resolvePrice({ planCode, originalPrice, couponCode = '', now = new Date(), skipKillSwitch = false }) {
  const baseResult = {
    originalPrice: Number(originalPrice) || 0,
    finalPrice: Number(originalPrice) || 0,
    discountPercent: 0,
    appliedOffer: null,
  };

  if (!planCode || !Number.isFinite(baseResult.originalPrice) || baseResult.originalPrice <= 0) {
    return baseResult;
  }

  if (!skipKillSwitch) {
    try {
      const state = await getPlatformState();
      if (state.offersPaused) return baseResult;
    } catch {
      // If state lookup fails, fail safe (no discount) rather than expose
      // an unexpected promo. The user can retry.
      return baseResult;
    }
  }

  const normalizedCoupon = String(couponCode || '').trim().toUpperCase();

  // Pull every potentially-eligible offer in one query, then filter in memory.
  // The collection is small (admin-managed, expected dozens at most).
  const candidates = await Offer.find({
    enabled: true,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
    $and: [
      {
        $or: [
          { appliesToPlanCodes: { $size: 0 } },
          { appliesToPlanCodes: planCode },
        ],
      },
    ],
  }).lean();

  let best = null;

  for (const offer of candidates) {
    if (offer.usageLimit != null && (offer.usageCount || 0) >= offer.usageLimit) {
      continue;
    }
    if (offer.type === 'coupon') {
      if (!normalizedCoupon || offer.couponCode !== normalizedCoupon) continue;
    }
    if (!best
      || (offer.type === 'coupon' && best.type !== 'coupon')
      || (offer.type === best.type && offer.discountPercent > best.discountPercent)) {
      best = offer;
    }
  }

  if (!best) return baseResult;

  const discount = Math.max(0, Math.min(95, Number(best.discountPercent) || 0));
  // Round to 2 decimals to keep INR amounts clean (Razorpay accepts paise).
  const finalPrice = Math.round((baseResult.originalPrice * (100 - discount)) * 100 / 100) / 100;

  return {
    originalPrice: baseResult.originalPrice,
    finalPrice,
    discountPercent: discount,
    appliedOffer: {
      id: String(best._id),
      name: best.name,
      type: best.type,
      label: best.label || '',
      discountPercent: discount,
      ...(best.couponCode ? { couponCode: best.couponCode } : {}),
    },
  };
}

/**
 * Atomically increment usageCount on a successfully-applied offer.
 * Returns true if the increment was accepted (offer still under cap).
 */
export async function recordOfferUsage(offerId) {
  if (!offerId) return false;
  try {
    const updated = await Offer.findOneAndUpdate(
      {
        _id: offerId,
        $or: [
          { usageLimit: { $exists: false } },
          { usageLimit: null },
          { $expr: { $lt: ['$usageCount', '$usageLimit'] } },
        ],
      },
      { $inc: { usageCount: 1 } },
      { new: true }
    );
    return Boolean(updated);
  } catch {
    return false;
  }
}
