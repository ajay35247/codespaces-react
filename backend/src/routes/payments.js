import Razorpay from 'razorpay';
import { Router } from 'express';
import crypto from 'crypto';
import express from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import { requirePaymentsEnabled } from '../middleware/platformControl.js';
import { getSubscriptionFeatures } from '../middleware/subscription.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Payment from '../schemas/PaymentSchema.js';

const router = Router();
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const plans = [
  { id: 'basic', title: 'Starter', price: 999, currency: 'INR', description: 'Up to 50 loads / month' },
  { id: 'growth', title: 'Growth', price: 2499, currency: 'INR', description: 'Up to 200 loads / month' },
  { id: 'enterprise', title: 'Enterprise', price: 4999, currency: 'INR', description: 'Unlimited loads + premium support' },
];

const subscribeSchema = Joi.object({
  planId: Joi.string().valid(...plans.map((plan) => plan.id)).required(),
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
  res.json({ plans });
});

router.post('/subscribe', verifyJWT, requirePaymentsEnabled(), flagFraud, validateBody(subscribeSchema), async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }

  const { planId } = req.body;
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  try {
    const order = await razorpay.orders.create({
      amount: plan.price * 100,
      currency: 'INR',
      receipt: `receipt_${crypto.randomUUID()}`,
      notes: { planId: plan.id, userId: req.user.id },
      payment_capture: 1,
    });

    // Persist order to DB so webhook events can be correlated
    try {
      await Payment.create({
        transactionId: order.id,
        razorpayOrderId: order.id,
        planId: plan.id,
        userId: req.user.id,
        amount: plan.price,
        currency: 'INR',
        sender: req.user.id,
        status: 'pending',
      });
    } catch (dbErr) {
      console.warn('Payment record creation failed:', dbErr.message);
    }

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
      plan,
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

router.get('/subscription/me', verifyJWT, async (req, res) => {
  try {
    const payment = await Payment.findOne(
      { userId: req.user.id, planId: { $exists: true, $ne: null } },
      null,
      { sort: { createdAt: -1 } }
    ).lean();

    if (!payment) {
      return res.json({ subscription: null });
    }

    const plan = plans.find((p) => p.id === payment.planId) || null;

    // Compute renewal date (30 days from payment creation)
    const renewalDate = payment.createdAt
      ? new Date(new Date(payment.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)
      : null;

    return res.json({
      subscription: {
        planId: payment.planId,
        plan: plan?.title || payment.planId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        renewal: renewalDate ? renewalDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
      },
    });
  } catch (error) {
    console.error('Subscription me error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch subscription' });
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

export default router;
