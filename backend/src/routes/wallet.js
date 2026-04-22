import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { requirePaymentsEnabled } from '../middleware/platformControl.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Wallet from '../schemas/WalletSchema.js';
import WalletTransaction from '../schemas/WalletTransactionSchema.js';

const router = Router();

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = razorpayKeyId && razorpayKeySecret
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const TOPUP_MIN_INR = 100;
const TOPUP_MAX_INR = 500000;
const WITHDRAW_MIN_INR = 100;

const topupSchema = Joi.object({
  amount: Joi.number().integer().min(TOPUP_MIN_INR).max(TOPUP_MAX_INR).required(),
});

const verifyTopupSchema = Joi.object({
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
});

const withdrawSchema = Joi.object({
  amount: Joi.number().integer().min(WITHDRAW_MIN_INR).required(),
  accountReference: Joi.string().trim().min(4).max(200).required(),
});

/** Constant-time hex-encoded HMAC comparison. */
function secureCompareHex(expected, actual) {
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

/** Fetch or lazily create a wallet for the authenticated user. */
async function getOrCreateWallet(userId) {
  const existing = await Wallet.findOne({ userId });
  if (existing) return existing;
  try {
    return await Wallet.create({ userId, balance: 0 });
  } catch (err) {
    // Possible unique-index race if two requests raced to create the wallet.
    if (err.code === 11000) {
      return Wallet.findOne({ userId });
    }
    throw err;
  }
}

// All wallet routes require an authenticated public user (no admin).
router.use(verifyJWT, requireRole(['shipper', 'driver', 'broker']));

// ── GET /api/wallet — balance + recent transactions ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    const recent = await WalletTransaction.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      wallet: {
        balance: wallet.balance,
        currency: wallet.currency,
        locked: wallet.locked,
        lastTransactionAt: wallet.lastTransactionAt,
      },
      recentTransactions: recent,
    });
  } catch (error) {
    console.error('Wallet fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

// ── GET /api/wallet/transactions — paginated ledger ──────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ userId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({ userId: req.user.id }),
    ]);

    return res.json({
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Wallet transactions error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── POST /api/wallet/topup — create a Razorpay order for top-up ──────────────
router.post('/topup', requirePaymentsEnabled(), validateBody(topupSchema), async (req, res) => {
  if (!razorpay) {
    return res.status(500).json({ error: 'Payment gateway is not configured' });
  }
  try {
    await getOrCreateWallet(req.user.id);
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `wallet_${crypto.randomUUID()}`,
      notes: { purpose: 'wallet-topup', userId: String(req.user.id) },
      payment_capture: 1,
    });

    // Record a pending ledger entry so we can correlate webhook events.
    await WalletTransaction.create({
      userId: req.user.id,
      type: 'credit',
      purpose: 'topup',
      amount,
      currency: 'INR',
      balanceAfter: 0, // placeholder; set on verify
      razorpayOrderId: order.id,
      status: 'pending',
    });

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: razorpayKeyId,
    });
  } catch (error) {
    console.error('Wallet top-up order error:', error.message);
    return res.status(500).json({ error: 'Failed to create top-up order' });
  }
});

// ── POST /api/wallet/topup/verify — credit wallet after Razorpay success ─────
router.post('/topup/verify', requirePaymentsEnabled(), validateBody(verifyTopupSchema), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (!secureCompareHex(expected, razorpay_signature)) {
    return res.status(400).json({ error: 'Invalid payment signature' });
  }

  try {
    // Find the pending ledger entry created by /topup; ensure it belongs to
    // the calling user to prevent cross-account credit attacks.
    const pending = await WalletTransaction.findOne({
      userId: req.user.id,
      razorpayOrderId: String(razorpay_order_id),
      status: 'pending',
      purpose: 'topup',
    });

    if (!pending) {
      return res.status(404).json({ error: 'Top-up order not found or already processed' });
    }

    // Atomic increment so concurrent credits never lose updates.
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId: req.user.id, locked: { $ne: true } },
      {
        $inc: { balance: pending.amount },
        $set: { lastTransactionAt: new Date() },
      },
      { new: true }
    );

    if (!updatedWallet) {
      return res.status(409).json({ error: 'Wallet is locked and cannot be credited' });
    }

    pending.status = 'completed';
    pending.balanceAfter = updatedWallet.balance;
    pending.razorpayPaymentId = String(razorpay_payment_id);
    await pending.save();

    return res.json({
      verified: true,
      balance: updatedWallet.balance,
      transactionId: pending._id,
    });
  } catch (error) {
    console.error('Wallet top-up verify error:', error.message);
    return res.status(500).json({ error: 'Failed to verify top-up' });
  }
});

// ── POST /api/wallet/withdraw — advanced feature, subscription-only ──────────
router.post(
  '/withdraw',
  requirePaymentsEnabled(),
  requireActiveSubscription('basic'),
  validateBody(withdrawSchema),
  async (req, res) => {
    try {
      const { amount, accountReference } = req.body;
      const wallet = await getOrCreateWallet(req.user.id);

      if (wallet.locked) {
        return res.status(409).json({ error: 'Wallet is locked' });
      }

      // Atomic conditional debit: only succeed if balance is sufficient and
      // the wallet isn't locked. This prevents negative balances under
      // concurrent withdrawal attempts.
      const debited = await Wallet.findOneAndUpdate(
        {
          userId: req.user.id,
          balance: { $gte: amount },
          locked: { $ne: true },
        },
        {
          $inc: { balance: -amount },
          $set: { lastTransactionAt: new Date() },
        },
        { new: true }
      );

      if (!debited) {
        return res.status(402).json({ error: 'Insufficient wallet balance' });
      }

      const reference = `WD-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const tx = await WalletTransaction.create({
        userId: req.user.id,
        type: 'debit',
        purpose: 'withdrawal',
        amount,
        currency: 'INR',
        balanceAfter: debited.balance,
        reference,
        status: 'pending', // payout settlement is processed offline
        notes: 'Withdrawal to linked bank account / UPI',
      });

      return res.status(201).json({
        message: 'Withdrawal request submitted',
        reference,
        balance: debited.balance,
        transactionId: tx._id,
      });
    } catch (error) {
      console.error('Wallet withdraw error:', error.message);
      return res.status(500).json({ error: 'Failed to submit withdrawal' });
    }
  }
);

export default router;
