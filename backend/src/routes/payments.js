import Razorpay from 'razorpay';
import { Router } from 'express';
import crypto from 'crypto';

const router = Router();
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret }) : null;

const plans = [
  { id: 'basic', title: 'Starter', price: 999, currency: 'INR', description: 'Up to 50 loads / month' },
  { id: 'growth', title: 'Growth', price: 2499, currency: 'INR', description: 'Up to 200 loads / month' },
  { id: 'enterprise', title: 'Enterprise', price: 4999, currency: 'INR', description: 'Unlimited loads + premium support' },
];

router.get('/plans', (req, res) => {
  res.json({ plans });
});

router.post('/subscribe', async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }

  const { planId, currency } = req.body;
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  try {
    const amount = plan.price * 100;
    const orderOptions = {
      amount,
      currency: currency || 'INR',
      receipt: `receipt_${crypto.randomUUID()}`,
      notes: { planId: plan.id },
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(orderOptions);

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

router.post('/subscription/upgrade', (req, res) => {
  return res.status(200).json({ message: 'Subscription upgraded successfully', action: 'upgrade' });
});

router.post('/subscription/downgrade', (req, res) => {
  return res.status(200).json({ message: 'Subscription downgraded successfully', action: 'downgrade' });
});

router.post('/subscription/cancel', (req, res) => {
  return res.status(200).json({ message: 'Subscription canceled successfully', action: 'cancel' });
});

router.get('/wallets', (req, res) => {
  res.json({
    wallets: [
      { owner: 'Driver A', balance: 42000, currency: 'INR' },
      { owner: 'Broker X', balance: 18500, currency: 'INR' },
    ],
  });
});

router.post('/payout', (req, res) => {
  const { driverId, amount } = req.body;
  if (!driverId || !amount) {
    return res.status(400).json({ error: 'driverId and amount are required' });
  }
  return res.status(200).json({ message: 'Payout scheduled', driverId, amount });
});

export default router;
