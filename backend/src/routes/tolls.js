import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import Razorpay from 'razorpay';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { requirePaymentsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import FasTagWallet from '../schemas/FasTagWalletSchema.js';
import TollTransaction from '../schemas/TollTransactionSchema.js';
import Payment from '../schemas/PaymentSchema.js';

const router = Router();

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

// All toll routes require authentication; drivers and fleet-managers use them
router.use(verifyJWT, requireRole(['driver', 'fleet-manager']));

// ── Validation schemas ────────────────────────────────────────────────────────

const setupWalletSchema = Joi.object({
  vehicleNumber: Joi.string().trim().min(4).max(20).uppercase().required(),
  tagId: Joi.string().trim().max(64).optional(),
  bankName: Joi.string().trim().max(80).optional(),
  lowBalanceThreshold: Joi.number().integer().min(0).max(10000).optional(),
});

const recordTollSchema = Joi.object({
  tollName: Joi.string().trim().min(2).max(200).required(),
  tollLocation: Joi.string().trim().min(2).max(300).required(),
  amount: Joi.number().positive().required(),
  highway: Joi.string().trim().max(100).optional(),
  lane: Joi.string().trim().max(50).optional(),
  direction: Joi.string().valid('entry', 'exit', 'single').default('single'),
  source: Joi.string().valid('fastag', 'manual', 'cash').default('fastag'),
  crossedAt: Joi.date().iso().optional(),
});

const rechargeOrderSchema = Joi.object({
  amount: Joi.number().integer().min(100).max(100000).required(),
});

const rechargeVerifySchema = Joi.object({
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
});

// ── GET /api/tolls/wallet – fetch or return null ──────────────────────────────

router.get('/wallet', async (req, res) => {
  try {
    const wallet = await FasTagWallet.findOne({ userId: req.user.id }).lean();
    return res.json({ wallet: wallet || null });
  } catch (error) {
    console.error('FASTag wallet fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch FASTag wallet' });
  }
});

// ── POST /api/tolls/wallet/setup – create or update wallet ───────────────────

router.post('/wallet/setup', validateBody(setupWalletSchema), async (req, res) => {
  try {
    const { vehicleNumber, tagId, bankName, lowBalanceThreshold } = req.body;

    const update = {
      vehicleNumber,
      ...(tagId !== undefined && { tagId }),
      ...(bankName !== undefined && { bankName }),
      ...(lowBalanceThreshold !== undefined && { lowBalanceThreshold }),
    };

    const wallet = await FasTagWallet.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({ wallet, message: 'FASTag wallet configured' });
  } catch (error) {
    console.error('FASTag wallet setup error:', error.message);
    return res.status(500).json({ error: 'Failed to set up FASTag wallet' });
  }
});

// ── POST /api/tolls/recharge/order – create Razorpay order for top-up ────────

router.post('/recharge/order', requirePaymentsEnabled(), validateBody(rechargeOrderSchema), async (req, res) => {
  try {
    const wallet = await FasTagWallet.findOne({ userId: req.user.id });
    if (!wallet) {
      return res.status(404).json({ error: 'FASTag wallet not set up. Please configure your wallet first.' });
    }

    const { amount } = req.body; // amount in ₹ (integer)

    if (!razorpay) {
      return res.status(500).json({ error: 'Payment gateway is not configured' });
    }

    const order = await razorpay.orders.create({
      amount: amount * 100, // paise
      currency: 'INR',
      receipt: `fastag_${crypto.randomUUID()}`,
      notes: {
        purpose: 'fastag_recharge',
        userId: req.user.id,
        vehicleNumber: wallet.vehicleNumber,
        amount: String(amount),
      },
      payment_capture: 1,
    });

    // Persist pending payment record
    await Payment.create({
      transactionId: order.id,
      razorpayOrderId: order.id,
      planId: 'fastag_recharge',
      userId: req.user.id,
      amount,
      currency: 'INR',
      sender: req.user.id,
      receiver: 'fastag-wallet',
      status: 'pending',
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
      vehicleNumber: wallet.vehicleNumber,
    });
  } catch (error) {
    console.error('FASTag recharge order error:', error.message);
    return res.status(500).json({ error: 'Failed to create recharge order' });
  }
});

// ── POST /api/tolls/recharge/verify – verify payment and credit balance ───────

router.post('/recharge/verify', validateBody(rechargeVerifySchema), async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpayKeySecret) {
      return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    // Verify Razorpay signature
    const expected = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    // Accept the signature as-is; Razorpay sends lowercase hex.
    const signatureBuf = Buffer.from(String(razorpay_signature), 'hex');

    if (
      expectedBuf.length === 0
      || expectedBuf.length !== signatureBuf.length
      || !crypto.timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Find pending payment record
    const payment = await Payment.findOne({ razorpayOrderId: String(razorpay_order_id), userId: req.user.id });
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    if (payment.status === 'captured') {
      return res.status(409).json({ error: 'Payment already processed' });
    }

    const rechargeAmount = payment.amount;

    // Credit wallet balance
    const wallet = await FasTagWallet.findOneAndUpdate(
      { userId: req.user.id },
      {
        $inc: { balance: rechargeAmount },
        $set: { lastRechargeAmount: rechargeAmount, lastRechargeAt: new Date() },
      },
      { new: true }
    );

    if (!wallet) {
      return res.status(404).json({ error: 'FASTag wallet not found' });
    }

    // Recompute status after balance change and save
    await wallet.save();

    // Mark payment captured
    payment.razorpayPaymentId = String(razorpay_payment_id);
    payment.status = 'captured';
    await payment.save();

    return res.json({
      verified: true,
      newBalance: wallet.balance,
      rechargeAmount,
      vehicleNumber: wallet.vehicleNumber,
    });
  } catch (error) {
    console.error('FASTag recharge verify error:', error.message);
    return res.status(500).json({ error: 'Failed to verify recharge payment' });
  }
});

// ── POST /api/tolls/transactions – record a toll crossing ────────────────────

router.post('/transactions', validateBody(recordTollSchema), async (req, res) => {
  try {
    const { tollName, tollLocation, amount, highway, lane, direction, source, crossedAt } = req.body;

    // Find wallet to deduct balance (if source is fastag)
    const wallet = await FasTagWallet.findOne({ userId: req.user.id });
    if (!wallet) {
      return res.status(404).json({ error: 'FASTag wallet not set up. Please configure your wallet first.' });
    }

    let balanceAfter = wallet.balance;

    if (source === 'fastag') {
      if (wallet.balance < amount) {
        return res.status(402).json({
          error: `Insufficient FASTag balance. Available: ₹${wallet.balance}, required: ₹${amount}. Please recharge.`,
          balance: wallet.balance,
        });
      }
      wallet.balance -= amount;
      await wallet.save();
      balanceAfter = wallet.balance;
    }

    // Generate a unique transaction reference
    const transactionRef = `TOL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const transaction = await TollTransaction.create({
      userId: req.user.id,
      vehicleNumber: wallet.vehicleNumber,
      tagId: wallet.tagId || null,
      tollName,
      tollLocation,
      highway: highway || null,
      lane: lane || null,
      amount,
      balanceAfter,
      source,
      direction,
      status: 'success',
      transactionRef,
      crossedAt: crossedAt ? new Date(crossedAt) : new Date(),
    });

    return res.status(201).json({
      transaction,
      wallet: { balance: balanceAfter, status: wallet.status, vehicleNumber: wallet.vehicleNumber },
    });
  } catch (error) {
    console.error('Toll transaction record error:', error.message);
    return res.status(500).json({ error: 'Failed to record toll transaction' });
  }
});

// ── GET /api/tolls/transactions – list toll crossing history ──────────────────

router.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = { userId: req.user.id };

    // Optional date range filter
    if (req.query.from || req.query.to) {
      filter.crossedAt = {};
      if (req.query.from) filter.crossedAt.$gte = new Date(String(req.query.from));
      if (req.query.to) filter.crossedAt.$lte = new Date(String(req.query.to));
    }

    const [transactions, total] = await Promise.all([
      TollTransaction.find(filter).sort({ crossedAt: -1 }).skip(skip).limit(limit).lean(),
      TollTransaction.countDocuments(filter),
    ]);

    return res.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Toll transactions list error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch toll transactions' });
  }
});

// ── GET /api/tolls/summary – aggregated stats ─────────────────────────────────

router.get('/summary', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [wallet, monthlyStats, allTimeStats] = await Promise.all([
      FasTagWallet.findOne({ userId: req.user.id }).lean(),
      TollTransaction.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.user.id), crossedAt: { $gte: startOfMonth }, status: 'success' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      TollTransaction.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.user.id), status: 'success' } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      summary: {
        balance: wallet?.balance ?? 0,
        walletStatus: wallet?.status ?? 'not_setup',
        vehicleNumber: wallet?.vehicleNumber ?? null,
        monthlySpend: monthlyStats[0]?.totalAmount ?? 0,
        monthlyCrossings: monthlyStats[0]?.count ?? 0,
        totalSpend: allTimeStats[0]?.totalAmount ?? 0,
        totalCrossings: allTimeStats[0]?.count ?? 0,
        lastRechargeAmount: wallet?.lastRechargeAmount ?? null,
        lastRechargeAt: wallet?.lastRechargeAt ?? null,
        lowBalanceThreshold: wallet?.lowBalanceThreshold ?? 200,
      },
    });
  } catch (error) {
    console.error('Toll summary error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch toll summary' });
  }
});

export default router;
