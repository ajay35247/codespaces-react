import Razorpay from 'razorpay';
import { Router } from 'express';
import crypto from 'crypto';
import express from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';

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

    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
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
      case 'payment.captured':
        console.log('Payment captured:', event.payload.payment.entity.id);
        break;
      case 'payment.failed':
        console.warn('Payment failed:', event.payload.payment.entity.id);
        break;
      case 'subscription.activated':
        console.log('Subscription activated:', event.payload.subscription.entity.id);
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

router.post('/subscribe', verifyJWT, flagFraud, async (req, res) => {
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

router.post('/verify', verifyJWT, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields' });
  }

  const expected = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature))) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  return res.json({ verified: true, paymentId: razorpay_payment_id });
});

router.post('/subscription/upgrade', verifyJWT, (req, res) => {
  return res.status(200).json({ message: 'Subscription upgraded successfully', action: 'upgrade' });
});

router.post('/subscription/downgrade', verifyJWT, (req, res) => {
  return res.status(200).json({ message: 'Subscription downgraded successfully', action: 'downgrade' });
});

router.post('/subscription/cancel', verifyJWT, (req, res) => {
  return res.status(200).json({ message: 'Subscription canceled successfully', action: 'cancel' });
});

router.get('/wallets', verifyJWT, requireRole(['admin', 'fleet-manager']), (req, res) => {
  res.json({
    wallets: [
      { owner: 'Driver A', balance: 42000, currency: 'INR' },
      { owner: 'Broker X', balance: 18500, currency: 'INR' },
    ],
  });
});

router.post('/payout', verifyJWT, requireRole(['admin', 'fleet-manager']), (req, res) => {
  const { driverId, amount } = req.body;
  if (!driverId || !amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Valid driverId and positive amount are required' });
  }
  return res.status(200).json({ message: 'Payout scheduled', driverId, amount });
});

export default router;
