import { Router } from 'express';
import crypto from 'crypto';
import express from 'express';
import Razorpay from 'razorpay';
import { verifyJWT } from '../middleware/authorize.js';
import { requirePaymentsEnabled } from '../middleware/platformControl.js';
import {
  getActiveSubscription,
  getSubscriptionFeatures,
  PLAN_FEATURES,
  PLAN_RANK,
  resolvePlanCode,
} from '../middleware/subscription.js';
import { readUsage } from '../middleware/quotas.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Payment from '../schemas/PaymentSchema.js';
import { resolvePrice, recordOfferUsage } from '../utils/pricing.js';

const router = Router();
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

/**
 * Canonical 4-tier catalogue (see middleware/subscription.js for the
 * matching feature mapping). Yearly price = 10 × monthly (i.e. "2 months
 * free"); the savings line on the pricing UI is computed client-side from
 * these two numbers and `monthlyPrice * 12`.
 *
 * Prices are admin-tunable via the SubscriptionPlan collection in a future
 * iteration; for now this is the canonical default the pricing page reads
 * (and the only authoritative input to /subscribe).
 */
const PLAN_CATALOGUE = [
  {
    id: 'free',
    title: 'Free',
    tagline: 'Get started free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    cta: 'Stay Free',
    highlight: null,
  },
  {
    id: 'basic',
    title: 'Basic',
    tagline: 'Continue Basic',
    monthlyPrice: 99,
    yearlyPrice: 999,
    cta: 'Continue Basic',
    highlight: null,
  },
  {
    id: 'standard',
    title: 'Standard',
    tagline: 'Good performance, but you may miss the high-value loads',
    monthlyPrice: 199,
    yearlyPrice: 1999,
    cta: 'Continue Standard',
    highlight: 'popular', // gray "Popular" pill
    losses: [
      'You may miss high-value loads',
      'No premium badge — lower buyer trust',
      'No fast matching',
    ],
  },
  {
    id: 'premium',
    title: 'Premium',
    tagline: 'Never miss a premium load',
    monthlyPrice: 299,
    yearlyPrice: 2999,
    cta: 'Start Earning More',
    highlight: 'best-value', // gold "🔥 BEST VALUE" ribbon
    anchor: 'Only ~₹10/day for maximum earnings',
  },
];

function planCatalogueWithFeatures() {
  return PLAN_CATALOGUE.map((plan) => ({
    ...plan,
    features: PLAN_FEATURES[plan.id] || PLAN_FEATURES.free,
    yearlySavings: Math.max(0, plan.monthlyPrice * 12 - plan.yearlyPrice),
  }));
}

const PAID_PLAN_IDS = PLAN_CATALOGUE.filter((p) => p.monthlyPrice > 0).map((p) => p.id);

// Canonical plan ids exposed to subscribers via GET /payments/pricing. The
// admin pricing tab uses this list to filter out legacy SubscriptionPlan
// documents whose `code` is no longer part of the public catalogue, so the
// admin UI mirrors what shoppers actually see on /subscription.
export const PLAN_CATALOGUE_IDS = PLAN_CATALOGUE.map((p) => p.id);

const subscribeSchema = Joi.object({
  planId: Joi.string().valid(...PAID_PLAN_IDS).required(),
  billingCycle: Joi.string().valid('monthly', 'yearly').default('monthly'),
  couponCode: Joi.string().trim().min(2).max(50).pattern(/^[A-Za-z0-9_-]+$/).optional().allow(''),
});

const verifySchema = Joi.object({
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
});

function secureCompareHex(expected, actual) {
  // Both values are SHA-256 hex strings (64 chars each).  Use 'hex' decoding
  // so the comparison operates on the raw digest bytes, consistent with the
  // webhook signature check above.
  try {
    const left = Buffer.from(String(expected || ''), 'hex');
    const right = Buffer.from(String(actual || ''), 'hex');
    if (left.length === 0 || left.length !== right.length) {
      return false;
    }
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

// ── Fraud detection ─ in-memory sliding window per IP ──────────────────────
const paymentAttempts = new Map();
const FRAUD_WINDOW_MS = 15 * 60 * 1000;
const FRAUD_MAX = 5;

function flagFraud(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const record = paymentAttempts.get(ip) || { count: 0, first: now };

  if (now - record.first > FRAUD_WINDOW_MS) {
    record.count = 1;
    record.first = now;
  } else {
    record.count += 1;
  }

  paymentAttempts.set(ip, record);

  if (record.count > FRAUD_MAX) {
    return res.status(429).json({ error: 'Too many payment attempts. Please try again later.' });
  }
  next();
}

// ── Razorpay webhook – uses raw body ───────────────────────────────────────
// IMPORTANT: mount BEFORE express.json() parses the body for this route.
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!webhookSecret) {
      console.warn('RAZORPAY_WEBHOOK_SECRET not configured – skipping verification');
      return res.json({ status: 'ok' });
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing signature header' });
    }

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body)
      .digest('hex');

    // Use 'hex' encoding since both values are hex strings produced by createHmac().digest('hex').
    // This guarantees equal-length buffers and correct byte-level comparison.
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(String(signature).toLowerCase(), 'hex');
    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    // Handle events
    switch (event.event) {
      case 'payment.captured': {
        const entity = event.payload?.payment?.entity;
        const paymentId = entity?.id ? String(entity.id) : null;
        if (paymentId) {
          Payment.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            { $set: { status: 'captured', webhookEvent: 'payment.captured' } }
          ).catch((err) => console.warn('Webhook DB update failed:', err.message));
        }
        console.log('Payment captured:', paymentId);
        break;
      }
      case 'payment.failed': {
        const entity = event.payload?.payment?.entity;
        const paymentId = entity?.id ? String(entity.id) : null;
        if (paymentId) {
          Payment.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            { $set: { status: 'failed', webhookEvent: 'payment.failed' } }
          ).catch((err) => console.warn('Webhook DB update failed:', err.message));
        }
        console.warn('Payment failed:', paymentId);
        break;
      }
      case 'subscription.activated':
        console.log('Subscription activated:', event.payload?.subscription?.entity?.id);
        break;
      default:
        console.log('Unhandled Razorpay event:', event.event);
    }

    return res.json({ status: 'ok' });
  }
);

router.get('/plans', (req, res) => {
  // Returns the canonical 4-tier catalogue with feature limits attached
  // so the pricing page can render cards without a second round-trip.
  res.json({ plans: planCatalogueWithFeatures() });
});

/**
 * Public pricing listing — returns each plan with both monthly + yearly
 * effective prices after admin-managed offers are applied.  This is what
 * the Subscription page renders.
 *
 * Optional `?couponCode=XYZ` query string previews a coupon discount.
 * The same resolver is invoked again at /subscribe so a malicious client
 * cannot pass a fake discounted price.
 */
router.get('/pricing', async (req, res) => {
  try {
    const couponCode = typeof req.query.couponCode === 'string' ? req.query.couponCode.slice(0, 50) : '';
    const enriched = await Promise.all(planCatalogueWithFeatures().map(async (plan) => {
      // Free tier never carries a discount.
      if (plan.monthlyPrice === 0 && plan.yearlyPrice === 0) {
        return {
          ...plan,
          monthly: { originalPrice: 0, finalPrice: 0, discountPercent: 0, appliedOffer: null },
          yearly:  { originalPrice: 0, finalPrice: 0, discountPercent: 0, appliedOffer: null },
        };
      }
      const [monthly, yearly] = await Promise.all([
        resolvePrice({ planCode: plan.id, originalPrice: plan.monthlyPrice, couponCode }),
        resolvePrice({ planCode: plan.id, originalPrice: plan.yearlyPrice,  couponCode }),
      ]);
      return { ...plan, monthly, yearly };
    }));
    return res.json({ plans: enriched, couponApplied: Boolean(couponCode) });
  } catch (error) {
    console.error('Pricing fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

router.post('/subscribe', verifyJWT, requirePaymentsEnabled(), flagFraud, validateBody(subscribeSchema), async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }

  const { planId, couponCode } = req.body;
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const plan = PLAN_CATALOGUE.find((item) => item.id === planId);
  if (!plan || plan.monthlyPrice === 0) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  // Downgrade-after-expiry rule — the spec disallows mid-cycle downgrade.
  // Upgrades are always allowed (extends the new tier from now). For
  // downgrades, instead of charging for a lower tier while a higher tier
  // is still active, we ask the user to wait.  A future iteration may
  // schedule the change for currentSub.expiresAt; for v1 we reject.
  try {
    const currentSub = await getActiveSubscription(req.user.id);
    if (currentSub && currentSub.source === 'paid') {
      const currentRank = PLAN_RANK[currentSub.planId] ?? 0;
      const requestedRank = PLAN_RANK[planId] ?? 0;
      if (requestedRank < currentRank
          && currentSub.expiresAt
          && new Date(currentSub.expiresAt).getTime() > Date.now()) {
        return res.status(409).json({
          error: 'Downgrade is only allowed after your current plan expires',
          code: 'DOWNGRADE_AFTER_EXPIRY',
          currentPlan: currentSub.planId,
          requestedPlan: planId,
          expiresAt: currentSub.expiresAt,
        });
      }
    }
  } catch (err) {
    // If the entitlement lookup fails, be permissive but log it — we
    // would rather risk a downgrade attempt than reject a legitimate
    // upgrade because of a transient DB error.
    console.warn('Subscribe: getActiveSubscription failed', err.message);
  }

  const originalPrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

  // Server-side price resolution. This is the only place the actual
  // charge amount is computed — never trust a price coming from the client.
  let resolved;
  try {
    resolved = await resolvePrice({
      planCode: plan.id,
      originalPrice,
      couponCode: couponCode || '',
    });
  } catch (err) {
    console.warn('Price resolution failed, falling back to list price:', err.message);
    resolved = { originalPrice, finalPrice: originalPrice, discountPercent: 0, appliedOffer: null };
  }

  // If the user typed a coupon but it produced no offer, reject explicitly
  // so they don't silently pay full price thinking it applied.
  if (couponCode && !resolved.appliedOffer) {
    return res.status(400).json({ error: 'Coupon code is invalid, expired, or not applicable to this plan' });
  }

  const chargeAmount = Math.max(1, Math.round(resolved.finalPrice));

  try {
    const order = await razorpay.orders.create({
      amount: chargeAmount * 100,
      currency: 'INR',
      receipt: `receipt_${crypto.randomUUID()}`,
      notes: {
        planId: plan.id,
        billingCycle,
        userId: req.user.id,
        offerId: resolved.appliedOffer?.id || '',
        discountPercent: String(resolved.discountPercent || 0),
      },
      payment_capture: 1,
    });

    // Persist order to DB so webhook events can be correlated
    try {
      await Payment.create({
        transactionId: order.id,
        razorpayOrderId: order.id,
        planId: plan.id,
        billingCycle,
        userId: req.user.id,
        amount: chargeAmount,
        currency: 'INR',
        sender: req.user.id,
        status: 'pending',
      });
    } catch (dbErr) {
      console.warn('Payment record creation failed:', dbErr.message);
    }

    // Best-effort usage-count bump. recordOfferUsage is atomic and skips the
    // increment if the cap is already reached (defence against TOCTOU between
    // resolvePrice and the actual charge). Log failures with context — a
    // silent miss here would let usage drift past the cap unnoticed.
    if (resolved.appliedOffer?.id) {
      recordOfferUsage(resolved.appliedOffer.id).catch((err) => {
        console.warn('recordOfferUsage failed', { offerId: resolved.appliedOffer.id, userId: req.user.id, error: err.message });
      });
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
      plan: {
        ...plan,
        billingCycle,
        originalPrice: resolved.originalPrice,
        finalPrice: chargeAmount,
        discountPercent: resolved.discountPercent,
        appliedOffer: resolved.appliedOffer,
      },
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error.message);
    return res.status(500).json({ error: 'Failed to create payment order' });
  }
});

router.post('/verify', verifyJWT, validateBody(verifySchema), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!secureCompareHex(expected, razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  // Mark payment as verified in DB
  // razorpay_order_id and razorpay_payment_id are Joi-validated strings; cast to String for safety.
  try {
    await Payment.findOneAndUpdate(
      { razorpayOrderId: String(razorpay_order_id) },
      {
        $set: {
          razorpayPaymentId: String(razorpay_payment_id),
          status: 'captured',
        },
      }
    );
  } catch (dbErr) {
    console.warn('Payment verification DB update failed:', dbErr.message);
  }

  return res.json({ verified: true, paymentId: razorpay_payment_id });
});

router.post('/subscription/upgrade', verifyJWT, (req, res) => {
  // Subscription management is not yet implemented.  Returning a fake 200 success
  // would mislead users into believing their plan changed when it did not.
  return res.status(501).json({ error: 'Subscription upgrade is not yet implemented' });
});

router.post('/subscription/downgrade', verifyJWT, (req, res) => {
  return res.status(501).json({ error: 'Subscription downgrade is not yet implemented' });
});

router.post('/subscription/cancel', verifyJWT, async (req, res) => {
  try {
    // Mark the user's latest active subscription payment as cancelled
    const result = await Payment.findOneAndUpdate(
      { userId: req.user.id, status: { $in: ['captured', 'success', 'pending'] }, planId: { $exists: true, $ne: null } },
      { $set: { status: 'refunded', webhookEvent: 'subscription.cancelled' } },
      { sort: { createdAt: -1 }, new: true }
    );
    if (!result) {
      return res.status(404).json({ error: 'No active subscription found to cancel' });
    }
    return res.json({ message: 'Subscription cancelled', paymentId: result._id });
  } catch (error) {
    console.error('Subscription cancel error:', error.message);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ── Current user subscription ─────────────────────────────────────────────────
//
// Returns the canonical entitlement view used everywhere in the app: which
// plan is active (paid/trial/free), when it expires, today's usage vs the
// daily quota, and the full feature object. This is the single endpoint
// pages should call to render the "3/10 loads today" header bar and to
// know whether to show paywalls.

router.get('/subscription/me', verifyJWT, (req, res) => handleSubscriptionMe(req, res));

// Pricing-page friendly alias for the same data — duplicated handler so we
// don't depend on internal router.handle plumbing.
async function handleSubscriptionMe(req, res) {
  try {
    const sub = await getActiveSubscription(req.user.id);
    const usage = await readUsage(req.user.id);
    const planMeta = PLAN_CATALOGUE.find((p) => p.id === sub?.planId) || null;

    const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt) : null;
    return res.json({
      subscription: sub ? {
        planId: sub.planId,
        plan: planMeta?.title || sub.planId,
        amount: sub.amount,
        currency: sub.currency,
        status: sub.status,
        source: sub.source,
        billingCycle: sub.billingCycle || null,
        createdAt: sub.createdAt,
        expiresAt: sub.expiresAt,
        renewal: expiresAt
          ? expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : null,
        features: sub.features,
      } : null,
      usage: {
        date: usage.date,
        loadsCreated: usage.loadsCreated,
        bidsPlaced: usage.bidsPlaced,
        loadsLimit: sub?.features?.loadsPerDay ?? 0,
        bidsLimit:  sub?.features?.bidsPerDay ?? 0,
      },
    });
  } catch (error) {
    console.error('Subscription me error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch subscription' });
  }
}

router.get('/me/subscription', verifyJWT, handleSubscriptionMe);

// Cancel auto-renewal (alias of /subscription/cancel for the new UX copy).
// We do not refund — we mark the user's latest active sub as 'refunded' so
// getActiveSubscription stops counting it after the current window closes.
router.post('/cancel-renewal', verifyJWT, async (req, res) => {
  try {
    const result = await Payment.findOneAndUpdate(
      { userId: req.user.id, status: { $in: ['captured', 'success', 'pending'] }, planId: { $exists: true, $ne: null } },
      { $set: { status: 'refunded', webhookEvent: 'subscription.cancelled' } },
      { sort: { createdAt: -1 }, new: true }
    );
    if (!result) {
      return res.status(404).json({ error: 'No active subscription found to cancel' });
    }
    return res.json({ message: 'Auto-renewal cancelled. Your current plan stays active until expiry.', paymentId: result._id });
  } catch (error) {
    console.error('Cancel renewal error:', error.message);
    return res.status(500).json({ error: 'Failed to cancel renewal' });
  }
});

// ── Wallet endpoints moved to /api/wallet (see routes/wallet.js) ──────────────
// Legacy /payments/wallets and /payments/payout routes have been removed in
// favour of the dedicated wallet module available to all public roles.

// ── Advanced feature entitlement lookup ───────────────────────────────────────
router.get('/subscription/features', verifyJWT, async (req, res) => {
  try {
    const features = await getSubscriptionFeatures(req.user.id);
    return res.json(features);
  } catch (error) {
    console.error('Subscription features error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch subscription features' });
  }
});

// ── Public 15-day free trial ──────────────────────────────────────────────────
//
// Every authenticated public user (shipper / driver / broker / truck_owner) is
// eligible for a one-time 15-day free trial. Starting it stamps trial.startedAt
// and trial.endsAt on the User document. After endsAt, getActiveSubscription
// returns null and the platform's existing 402 gating resumes (unless the user
// has paid for a plan in the meantime).
import User from '../schemas/UserSchema.js';
import { PUBLIC_TRIAL_DAYS, PUBLIC_TRIAL_MS, getTrialStatus } from '../middleware/subscription.js';

router.get('/trial/status', verifyJWT, async (req, res) => {
  try {
    const status = await getTrialStatus(req.user.id);
    return res.json({ ...status, totalDays: PUBLIC_TRIAL_DAYS });
  } catch (error) {
    console.error('Trial status error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch trial status' });
  }
});

router.post('/trial/start', verifyJWT, requirePaymentsEnabled(), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.trial?.startedAt) {
      const ends = user.trial.endsAt ? new Date(user.trial.endsAt).getTime() : 0;
      if (ends > Date.now()) {
        return res.status(409).json({ error: 'Trial is already active', code: 'TRIAL_ACTIVE' });
      }
      return res.status(409).json({ error: 'Trial has already been used', code: 'TRIAL_USED' });
    }

    const now = new Date();
    user.trial = {
      startedAt: now,
      endsAt: new Date(now.getTime() + PUBLIC_TRIAL_MS),
      planId: 'basic',
      grantedBy: 'self',
    };
    await user.save();

    return res.json({
      state: 'active',
      startedAt: user.trial.startedAt,
      endsAt: user.trial.endsAt,
      planId: user.trial.planId,
      daysLeft: PUBLIC_TRIAL_DAYS,
      totalDays: PUBLIC_TRIAL_DAYS,
    });
  } catch (error) {
    console.error('Trial start error:', error.message);
    return res.status(500).json({ error: 'Failed to start trial' });
  }
});

export default router;
