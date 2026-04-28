import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { verifyJWT } from '../middleware/authorize.js';
import { requirePaymentsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Boost, { BOOST_CATALOG, BOOST_CODES } from '../schemas/BoostSchema.js';
import Load from '../schemas/LoadSchema.js';

/**
 * Boost / add-on routes.
 *
 *   GET  /boosts/catalog              → public catalogue (price + duration + copy)
 *   GET  /boosts/mine                 → boosts owned by the caller
 *   POST /boosts/purchase             → create a Razorpay order; persists Boost(pending)
 *   POST /boosts/verify               → verify Razorpay signature; flips Boost to active
 *                                       and (when targetId was supplied at purchase or
 *                                       verify time) sets activatedAt + expiresAt
 *   POST /boosts/:id/apply            → attach an *active, unattached* boost to a load
 *
 * Boost is a one-shot, time-bound product. Once the expires window passes,
 * the search ranker simply ignores it; we do not need a teardown job —
 * but a periodic sweep flipping `status` from 'active' to 'expired' makes
 * admin queries cheaper. That sweep lives in services/subscriptionScheduler.js.
 */
const router = Router();
const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const purchaseSchema = Joi.object({
  productCode: Joi.string().valid(...BOOST_CODES).required(),
  // Optional — buyer may attach the boost to a specific load at purchase
  // time, or leave it blank and call /:id/apply later.
  targetId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
});

const verifySchema = Joi.object({
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
  // Caller can supply a targetId here too, in case it wasn't known at
  // /purchase time (e.g. UX where the user picks the load AFTER paying).
  targetId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
});

const applySchema = Joi.object({
  loadId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
});

function secureCompareHex(expected, actual) {
  try {
    const left  = Buffer.from(String(expected || ''), 'hex');
    const right = Buffer.from(String(actual   || ''), 'hex');
    if (left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

router.get('/catalog', (_req, res) => {
  return res.json({
    products: Object.values(BOOST_CATALOG).map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      unitPrice: p.unitPrice,
      durationHours: Math.round(p.durationMs / (60 * 60 * 1000)),
      targetType: p.targetType,
    })),
  });
});

router.get('/mine', verifyJWT, async (req, res) => {
  try {
    const rows = await Boost.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({ boosts: rows });
  } catch (err) {
    console.error('Boost listing error:', err.message);
    return res.status(500).json({ error: 'Failed to load boosts' });
  }
});

router.post('/purchase', verifyJWT, requirePaymentsEnabled(), validateBody(purchaseSchema), async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }
  const product = BOOST_CATALOG[req.body.productCode];
  if (!product) {
    // Should be caught by Joi but defence-in-depth.
    return res.status(400).json({ error: 'Invalid boost product' });
  }

  // If the buyer supplied a targetId, verify ownership of the load now so
  // we don't take their money for a load they cannot boost.
  let targetId = null;
  if (req.body.targetId) {
    const load = await Load.findById(req.body.targetId).select('postedBy').lean();
    if (!load) return res.status(404).json({ error: 'Load not found' });
    if (String(load.postedBy) !== String(req.user.id)) {
      return res.status(403).json({ error: 'You can only boost your own loads' });
    }
    targetId = req.body.targetId;
  }

  try {
    const order = await razorpay.orders.create({
      amount: product.unitPrice * 100,
      currency: 'INR',
      receipt: `boost_${crypto.randomUUID()}`,
      notes: {
        userId: req.user.id,
        productCode: product.code,
        targetId: targetId || '',
      },
      payment_capture: 1,
    });

    await Boost.create({
      userId: req.user.id,
      productCode: product.code,
      targetType: product.targetType,
      targetId,
      unitPrice: product.unitPrice,
      rankBoost: product.rankBoost,
      durationMs: product.durationMs,
      razorpayOrderId: order.id,
      status: 'pending',
    });

    return res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
      product: {
        code: product.code,
        name: product.name,
        unitPrice: product.unitPrice,
        durationHours: Math.round(product.durationMs / (60 * 60 * 1000)),
      },
    });
  } catch (err) {
    console.error('Boost order creation error:', err.message);
    return res.status(500).json({ error: 'Failed to create boost order' });
  }
});

router.post('/verify', verifyJWT, validateBody(verifySchema), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, targetId } = req.body;

  if (!razorpayKeySecret) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }
  const expected = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!secureCompareHex(expected, razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  const boost = await Boost.findOne({
    razorpayOrderId: String(razorpay_order_id),
    userId: req.user.id,
  });
  if (!boost) {
    return res.status(404).json({ error: 'Boost order not found' });
  }
  if (boost.status === 'active') {
    // Idempotent re-verify is fine — return the current state.
    return res.json({ verified: true, boost });
  }

  // If the buyer is supplying targetId for the first time at verify, validate
  // ownership before activating.
  if (targetId && !boost.targetId) {
    const load = await Load.findById(targetId).select('postedBy').lean();
    if (!load) return res.status(404).json({ error: 'Load not found' });
    if (String(load.postedBy) !== String(req.user.id)) {
      return res.status(403).json({ error: 'You can only boost your own loads' });
    }
    boost.targetId = new mongoose.Types.ObjectId(targetId);
  }

  const now = new Date();
  boost.status = 'active';
  boost.razorpayPaymentId = String(razorpay_payment_id);
  boost.activatedAt = now;
  boost.expiresAt = new Date(now.getTime() + boost.durationMs);
  await boost.save();

  return res.json({ verified: true, boost });
});

router.post('/:id/apply', verifyJWT, validateBody(applySchema), async (req, res) => {
  if (!/^[0-9a-fA-F]{24}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid boost id' });
  }
  const boost = await Boost.findOne({ _id: req.params.id, userId: req.user.id });
  if (!boost) return res.status(404).json({ error: 'Boost not found' });
  if (boost.status !== 'active') {
    return res.status(409).json({ error: 'Boost is not active', status: boost.status });
  }
  if (boost.targetId) {
    return res.status(409).json({ error: 'Boost is already attached to a load' });
  }
  const load = await Load.findById(req.body.loadId).select('postedBy').lean();
  if (!load) return res.status(404).json({ error: 'Load not found' });
  if (String(load.postedBy) !== String(req.user.id)) {
    return res.status(403).json({ error: 'You can only boost your own loads' });
  }

  boost.targetId = new mongoose.Types.ObjectId(req.body.loadId);
  await boost.save();
  return res.json({ ok: true, boost });
});

export default router;
