import Stripe from 'stripe';
import { Router } from 'express';

const router = Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2020-08-27' }) : null;

const plans = [
  { id: 'basic', title: 'Starter', price: 999, currency: 'INR', description: 'Up to 50 loads / month' },
  { id: 'growth', title: 'Growth', price: 2499, currency: 'INR', description: 'Up to 200 loads / month' },
  { id: 'enterprise', title: 'Enterprise', price: 4999, currency: 'INR', description: 'Unlimited loads + premium support' },
];

router.get('/plans', (req, res) => {
  res.json({ plans });
});

router.post('/subscribe', async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }

  const { planId, currency } = req.body;
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: currency || 'INR',
            product_data: { name: plan.title },
            unit_amount: plan.price * 100,
          },
          quantity: 1,
        },
      ],
      success_url: `${clientUrl}/payment?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${clientUrl}/payment?status=cancel`,
      metadata: { planId: plan.id },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error.message);
    return res.status(500).json({ error: 'Failed to create Stripe checkout session' });
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
