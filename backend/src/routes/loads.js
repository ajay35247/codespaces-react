import crypto from 'crypto';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { Router } from 'express';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { requireBookingsEnabled } from '../middleware/platformControl.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';
import User from '../schemas/UserSchema.js';
import {
  isRazorpayConfigured,
  isRazorpayXConfigured,
  verifyRazorpayOrderSignature,
  registerFundAccount,
  issuePayout,
} from '../utils/razorpayClient.js';
import { notify, pushLive } from '../services/notifications.js';

const router = Router();

// Shared Razorpay SDK instance — only the Orders API is exercised here.
// Payouts / Contacts / Fund Accounts go through utils/razorpayClient.js
// which hits the REST endpoints directly (RazorpayX isn't wrapped by
// the v2 SDK yet).
const razorpay = isRazorpayConfigured()
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const createLoadSchema = Joi.object({
  origin: Joi.string().trim().min(2).max(200).required(),
  destination: Joi.string().trim().min(2).max(200).required(),
  weight: Joi.string().trim().min(1).max(50).required(),
  truckType: Joi.string().trim().min(2).max(100).required(),
  freightPrice: Joi.number().positive().optional(),
  pickupDate: Joi.date().iso().optional(),
  dropDate: Joi.date().iso().optional(),
});

const bidSchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(128).required(),
  amount: Joi.number().positive().required(),
});

const ALLOWED_LOAD_STATUSES = new Set(['posted', 'in-transit', 'delivered', 'cancelled']);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('in-transit', 'delivered', 'cancelled').required(),
});

// Hard size cap on POD photo data URL (base64 ~ 4/3 of decoded bytes).
// 350_000 chars ≈ 260 KB decoded — enough for a phone snapshot, small
// enough to keep MongoDB documents reasonable without object storage.
const MAX_POD_PHOTO_LENGTH = 350_000;

const podSchema = Joi.object({
  receiverName: Joi.string().trim().min(2).max(120).required(),
  receiverPhone: Joi.string().trim().max(40).allow('').optional(),
  note: Joi.string().trim().max(1000).allow('').optional(),
  photoUrl: Joi.string()
    .pattern(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(MAX_POD_PHOTO_LENGTH)
    .allow('')
    .optional(),
});

const releasePaymentSchema = Joi.object({}).unknown(false);
const receivedPaymentSchema = Joi.object({}).unknown(false);

const rateSchema = Joi.object({
  stars: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().max(500).allow('').optional(),
});

/** Escape special regex characters to prevent regex injection. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status && ALLOWED_LOAD_STATUSES.has(String(req.query.status))) {
      filter.status = String(req.query.status);
    }
    if (req.query.origin) filter.origin = new RegExp(escapeRegex(req.query.origin), 'i');
    if (req.query.destination) filter.destination = new RegExp(escapeRegex(req.query.destination), 'i');

    const [loads, total] = await Promise.all([
      Load.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Load.countDocuments(filter),
    ]);

    return res.json({
      loads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Loads fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch loads' });
  }
});

router.post(
  '/',
  verifyJWT,
  requireRole(['shipper']),
  requireBookingsEnabled(),
  validateBody(createLoadSchema),
  async (req, res) => {
    try {
      const { origin, destination, weight, truckType, freightPrice, pickupDate, dropDate } = req.body;
      const loadId = `L-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const load = await Load.create({
        loadId,
        origin,
        destination,
        weight,
        truckType,
        freightPrice,
        pickupDate: pickupDate ? new Date(pickupDate) : undefined,
        dropDate: dropDate ? new Date(dropDate) : undefined,
        postedBy: req.user.id,
        postedByRole: req.user.role,
        status: 'posted',
      });
      return res.status(201).json({ load });
    } catch (error) {
      console.error('Load creation error:', error.message);
      return res.status(500).json({ error: 'Failed to create load' });
    }
  }
);

// ── All-side bidding ──────────────────────────────────────────────────────────
// Shippers, drivers, and brokers can all place competitive bids on open loads
// (subject to an active subscription — bidding is an "advanced" paid feature).
// Bidders cannot bid on loads they posted themselves.

router.post(
  '/bid',
  verifyJWT,
  requireRole(['shipper', 'driver', 'broker']),
  requireBookingsEnabled(),
  requireActiveSubscription('basic'),
  validateBody(bidSchema),
  async (req, res) => {
    try {
      const { loadId, amount } = req.body;
      // loadId is Joi-validated as string with max 128 chars; safe for direct field match.
      const load = await Load.findOne({ loadId: String(loadId) });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }
      if (load.status !== 'posted') {
        return res.status(409).json({ error: 'This load is no longer accepting bids' });
      }
      if (String(load.postedBy) === String(req.user.id)) {
        return res.status(403).json({ error: 'You cannot bid on a load you posted' });
      }
      const existingBid = load.bids.find((b) => {
        const idField = b.bidderId || b.brokerId;
        return idField && String(idField) === String(req.user.id);
      });
      if (existingBid) {
        return res.status(409).json({ error: 'You have already placed a bid on this load' });
      }
      load.bids.push({
        bidderId: req.user.id,
        bidderRole: req.user.role,
        amount,
        currency: 'INR',
      });
      await load.save();

      // Notify the load's shipper so their dashboard lights up without
      // needing to poll.  `pushLive` also fires a `load:bid-placed` event
      // so an already-open loads list can refresh in place.
      if (load.postedBy && String(load.postedBy) !== String(req.user.id)) {
        notify({
          userId: load.postedBy,
          type: 'bid:placed',
          title: `New bid on ${load.loadId}`,
          body: `₹${Number(amount).toLocaleString('en-IN')} from a ${req.user.role}`,
          link: `/shipper`,
          meta: { loadId: load.loadId, amount, bidderRole: req.user.role },
        }).catch(() => {});
        pushLive(load.postedBy, 'load:bid-placed', { loadId: load.loadId, amount });
      }

      return res.status(201).json({
        message: 'Bid submitted',
        loadId,
        amount,
        bidderId: req.user.id,
        bidderRole: req.user.role,
      });
    } catch (error) {
      console.error('Bid submission error:', error.message);
      return res.status(500).json({ error: 'Failed to submit bid' });
    }
  }
);

// ── Own loads (shipper / driver) ──────────────────────────────────────────────
// NOTE: /mine and /available MUST be declared before /:loadId so Express does
// not treat the literal string "mine" or "available" as a loadId parameter.

router.get(
  '/mine',
  verifyJWT,
  requireRole(['shipper', 'driver']),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
      const skip = (page - 1) * limit;

      let filter;
      if (req.user.role === 'driver') {
        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
          return res.status(400).json({ error: 'Invalid user ID' });
        }
        filter = { assignedDriver: new mongoose.Types.ObjectId(req.user.id) };
      } else {
        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
          return res.status(400).json({ error: 'Invalid user ID' });
        }
        filter = { postedBy: new mongoose.Types.ObjectId(req.user.id) };
      }

      if (req.query.status && ALLOWED_LOAD_STATUSES.has(String(req.query.status))) {
        filter.status = String(req.query.status);
      }

      const [loads, total] = await Promise.all([
        Load.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Load.countDocuments(filter),
      ]);

      return res.json({
        loads,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('My loads fetch error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch your loads' });
    }
  }
);

// ── Loads available for drivers ───────────────────────────────────────────────

router.get(
  '/available',
  verifyJWT,
  requireRole(['driver']),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
      const skip = (page - 1) * limit;

      const filter = { status: 'posted', assignedDriver: null };

      const [loads, total] = await Promise.all([
        Load.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Load.countDocuments(filter),
      ]);

      return res.json({
        loads,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('Available loads fetch error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch available loads' });
    }
  }
);

// ── Get single load by ID ─────────────────────────────────────────────────────

router.get('/:loadId', async (req, res) => {
  try {
    const load = await Load.findOne({ loadId: req.params.loadId }).lean();
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }
    return res.json({ load });
  } catch (error) {
    console.error('Load fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch load' });
  }
});

// ── Update load status ────────────────────────────────────────────────────────

router.patch(
  '/:loadId/status',
  verifyJWT,
  requireRole(['shipper', 'driver']),
  validateBody(updateStatusSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const { status } = req.body;

      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }

      // Authorization: shipper must own the load; driver must be assigned
      if (req.user.role === 'driver') {
        if (!load.assignedDriver || String(load.assignedDriver) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You are not assigned to this load' });
        }
        // Drivers can only move: in-transit → delivered
        if (load.status !== 'in-transit' || status !== 'delivered') {
          return res.status(409).json({ error: 'Drivers can only mark in-transit loads as delivered' });
        }
        // Require Proof-of-Delivery before allowing the status transition.
        // Drivers should use POST /:loadId/pod which submits POD and flips
        // status atomically; this PATCH path remains as a safety net for
        // loads that already have POD on file.
        if (!load.pod || !load.pod.receiverName) {
          return res.status(409).json({ error: 'Proof of Delivery required before marking delivered' });
        }
      } else {
        if (String(load.postedBy) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You do not own this load' });
        }
      }

      load.status = status;
      await load.save();

      // Push a refresh hint to both sides of the load.
      if (load.postedBy) pushLive(load.postedBy, 'load:status-changed', { loadId, status });
      if (load.assignedDriver) pushLive(load.assignedDriver, 'load:status-changed', { loadId, status });

      return res.json({ message: 'Load status updated', loadId, status });
    } catch (error) {
      console.error('Load status update error:', error.message);
      return res.status(500).json({ error: 'Failed to update load status' });
    }
  }
);

// ── Accept a bid ──────────────────────────────────────────────────────────────

router.post(
  '/:loadId/bids/:bidId/accept',
  verifyJWT,
  requireRole(['shipper']),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const bidId = String(req.params.bidId);

      const load = await Load.findOne({ loadId, postedBy: req.user.id });
      if (!load) {
        return res.status(404).json({ error: 'Load not found or not owned by you' });
      }
      if (load.status !== 'posted') {
        return res.status(409).json({ error: 'Only posted loads can have bids accepted' });
      }

      const bid = load.bids.id(bidId);
      if (!bid) {
        return res.status(404).json({ error: 'Bid not found' });
      }

      // Accept the selected bid, reject all others
      for (const b of load.bids) {
        b.status = String(b._id) === bidId ? 'accepted' : 'rejected';
      }
      load.status = 'in-transit';
      load.acceptedBidId = bid._id;
      // If the accepted bid came from a driver, auto-assign them so the load
      // shows up under the driver's /loads/mine view and status transitions.
      if (bid.bidderRole === 'driver' && bid.bidderId) {
        load.assignedDriver = bid.bidderId;
        // Best-effort: auto-bind the driver's most-recently-updated vehicle
        // so the shipper immediately gets live tracking.  The driver can
        // change it later via POST /:loadId/vehicle.
        try {
          const vehicle = await mongoose.connection.db.collection('vehicles').findOne(
            { ownerId: String(bid.bidderId) },
            { sort: { updatedAt: -1 }, projection: { vehicleId: 1 } }
          );
          if (vehicle?.vehicleId) {
            load.vehicleId = String(vehicle.vehicleId);
          }
        } catch (lookupErr) {
          console.warn('Auto-bind vehicle lookup failed:', lookupErr.message);
        }
      }
      await load.save();

      // Notify the winning bidder + any losers.
      for (const b of load.bids) {
        const bidderUserId = b.bidderId || b.brokerId;
        if (!bidderUserId) continue;
        if (String(b._id) === bidId) {
          notify({
            userId: bidderUserId,
            type: 'bid:accepted',
            title: `Your bid was accepted`,
            body: `Load ${load.loadId} — ${load.origin} → ${load.destination}`,
            link: b.bidderRole === 'driver' ? '/driver' : '/broker',
            meta: { loadId: load.loadId, amount: b.amount },
          }).catch(() => {});
        }
        pushLive(bidderUserId, 'load:bid-accepted', { loadId: load.loadId, won: String(b._id) === bidId });
      }
      // Shipper's own list should also refresh (status flipped to in-transit).
      pushLive(load.postedBy, 'load:status-changed', { loadId: load.loadId, status: 'in-transit' });

      return res.json({ message: 'Bid accepted, load is now in-transit', loadId, bidId });
    } catch (error) {
      console.error('Bid accept error:', error.message);
      return res.status(500).json({ error: 'Failed to accept bid' });
    }
  }
);

// ── Reject a bid ──────────────────────────────────────────────────────────────

router.post(
  '/:loadId/bids/:bidId/reject',
  verifyJWT,
  requireRole(['shipper']),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const bidId = String(req.params.bidId);

      const load = await Load.findOne({ loadId, postedBy: req.user.id });
      if (!load) {
        return res.status(404).json({ error: 'Load not found or not owned by you' });
      }

      const bid = load.bids.id(bidId);
      if (!bid) {
        return res.status(404).json({ error: 'Bid not found' });
      }
      bid.status = 'rejected';
      await load.save();

      return res.json({ message: 'Bid rejected', loadId, bidId });
    } catch (error) {
      console.error('Bid reject error:', error.message);
      return res.status(500).json({ error: 'Failed to reject bid' });
    }
  }
);

// ── Assign driver to load ─────────────────────────────────────────────────────
// NOTE: Driver assignment was previously handled by the fleet-manager role,
// which has been removed. Shippers now assign drivers implicitly by accepting
// a driver's bid (see /:loadId/bids/:bidId/accept above).

// ── Proof of Delivery (driver) ────────────────────────────────────────────────
// Driver submits POD details (receiver name + optional phone/note/photo).
// On success, transitions load to 'delivered' atomically so the loop is closed
// in one round-trip instead of POD + separate PATCH /status.

router.post(
  '/:loadId/pod',
  verifyJWT,
  requireRole(['driver']),
  validateBody(podSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }
      if (!load.assignedDriver || String(load.assignedDriver) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You are not assigned to this load' });
      }
      if (load.status !== 'in-transit') {
        return res.status(409).json({ error: 'POD can only be submitted for in-transit loads' });
      }
      if (load.pod && load.pod.receiverName) {
        return res.status(409).json({ error: 'POD already submitted for this load' });
      }
      load.pod = {
        receiverName: req.body.receiverName,
        receiverPhone: req.body.receiverPhone || '',
        note: req.body.note || '',
        photoUrl: req.body.photoUrl || '',
        submittedBy: req.user.id,
        deliveredAt: new Date(),
      };
      load.status = 'delivered';
      await load.save();

      // Tell the shipper their load is done and POD is on file.
      if (load.postedBy) {
        notify({
          userId: load.postedBy,
          type: 'load:pod',
          title: `POD submitted for ${load.loadId}`,
          body: `Delivered to ${load.pod.receiverName}`,
          link: `/shipper`,
          meta: { loadId: load.loadId },
        }).catch(() => {});
        pushLive(load.postedBy, 'load:status-changed', { loadId, status: 'delivered' });
      }

      return res.json({ message: 'POD submitted, load marked delivered', loadId, pod: load.pod, status: load.status });
    } catch (error) {
      console.error('POD submit error:', error.message);
      return res.status(500).json({ error: 'Failed to submit POD' });
    }
  }
);

// ── Payment release / acknowledge (closes the trust loop) ─────────────────────
// release  : shipper acknowledges they paid the driver (off-platform or via
//            their own gateway).  Requires load delivered + POD on file.
// received : driver acknowledges they received the funds.

router.post(
  '/:loadId/payment/release',
  verifyJWT,
  requireRole(['shipper']),
  validateBody(releasePaymentSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }
      if (String(load.postedBy) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You do not own this load' });
      }
      if (load.status !== 'delivered') {
        return res.status(409).json({ error: 'Load must be delivered before releasing payment' });
      }
      if (!load.pod || !load.pod.receiverName) {
        return res.status(409).json({ error: 'POD required before releasing payment' });
      }
      if (load.payment?.status !== 'pending') {
        return res.status(409).json({ error: `Payment already ${load.payment?.status}` });
      }

      // Try a real RazorpayX Payout to the driver's registered fund account
      // when the escrow has been funded and RazorpayX is configured.  Falls
      // back to the plain acknowledgement flow (mode='acknowledgement')
      // otherwise, so this endpoint never hard-fails for merchants who
      // haven't enabled payouts yet.
      let releaseMode = 'acknowledgement';
      let payoutId = '';
      if (
        isRazorpayXConfigured()
        && load.escrow?.status === 'funded'
        && load.assignedDriver
      ) {
        try {
          const driver = await User.findById(load.assignedDriver).select('fundAccount name email phone role');
          if (!driver?.fundAccount?.razorpayFundAccountId) {
            return res.status(409).json({
              error: 'Driver has not registered a payout destination yet',
              code: 'DRIVER_NO_FUND_ACCOUNT',
            });
          }
          const payout = await issuePayout({
            fundAccountId: driver.fundAccount.razorpayFundAccountId,
            amountInPaise: Math.round(Number(load.escrow.amount) * 100),
            mode: driver.fundAccount.method,
            referenceId: load.loadId,
            narration: `Load ${load.loadId}`.slice(0, 30),
          });
          if (payout.configured) {
            releaseMode = 'real';
            payoutId = payout.payoutId;
            load.escrow.razorpayPayoutId = payout.payoutId;
            load.escrow.status = 'released';
            load.escrow.releasedAt = new Date();
            load.escrow.releaseMode = 'real';
          }
        } catch (payoutErr) {
          console.error('RazorpayX payout failed:', payoutErr.message);
          load.escrow.failureReason = payoutErr.message;
          // Do NOT silently succeed — surface the failure to the shipper so
          // they can retry or fall back to an off-platform transfer.
          return res.status(502).json({
            error: `Payout failed: ${payoutErr.message}`,
            code: 'PAYOUT_FAILED',
          });
        }
      } else if (load.escrow?.status === 'none' || !load.escrow?.status) {
        // Older loads written before the escrow sub-doc existed may have
        // `load.escrow` as undefined; coerce to the default shape so we
        // don't TypeError when annotating releaseMode below.
        if (!load.escrow) {
          load.escrow = { status: 'none', releaseMode: 'acknowledgement' };
        } else {
          load.escrow.releaseMode = 'acknowledgement';
        }
      }

      load.payment = {
        status: 'released',
        releasedAt: new Date(),
        releasedBy: req.user.id,
        receivedAt: null,
        receivedBy: null,
      };
      await load.save();

      // Notify the driver that payment was released (and via which mode).
      if (load.assignedDriver) {
        notify({
          userId: load.assignedDriver,
          type: 'payment:released',
          title: `Payment released for ${load.loadId}`,
          body: releaseMode === 'real' ? 'Funds sent to your registered account' : 'Shipper has acknowledged payment',
          link: '/driver',
          meta: { loadId: load.loadId, releaseMode },
        }).catch(() => {});
      }

      return res.json({
        message: 'Payment marked released',
        loadId,
        payment: load.payment,
        escrow: load.escrow,
        releaseMode,
        payoutId,
      });
    } catch (error) {
      console.error('Payment release error:', error.message);
      return res.status(500).json({ error: 'Failed to release payment' });
    }
  }
);

router.post(
  '/:loadId/payment/received',
  verifyJWT,
  requireRole(['driver']),
  validateBody(receivedPaymentSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }
      if (!load.assignedDriver || String(load.assignedDriver) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You are not assigned to this load' });
      }
      if (load.payment?.status !== 'released') {
        return res.status(409).json({ error: 'Payment has not been released yet' });
      }
      load.payment.status = 'received';
      load.payment.receivedAt = new Date();
      load.payment.receivedBy = req.user.id;
      // When a real payout was issued, driver-side acknowledgement also
      // reconciles the escrow state to 'paid'.
      if (load.escrow?.status === 'released') {
        load.escrow.status = 'paid';
        load.escrow.paidAt = new Date();
      }
      await load.save();

      if (load.postedBy) {
        notify({
          userId: load.postedBy,
          type: 'payment:received',
          title: `Driver confirmed payment for ${load.loadId}`,
          body: 'Trip closed',
          link: '/shipper',
          meta: { loadId: load.loadId },
        }).catch(() => {});
      }

      return res.json({ message: 'Payment marked received', loadId, payment: load.payment, escrow: load.escrow });
    } catch (error) {
      console.error('Payment received error:', error.message);
      return res.status(500).json({ error: 'Failed to acknowledge payment' });
    }
  }
);

// ── Bilateral rating (shipper ↔ assigned driver) ──────────────────────────────
// Only the load's shipper or assigned driver may rate, only after delivery,
// at most once per role per load.  The ratee is inferred (shipper → driver,
// driver → shipper) so the client can't target arbitrary users.

router.post(
  '/:loadId/rate',
  verifyJWT,
  requireRole(['shipper', 'driver']),
  validateBody(rateSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }
      if (load.status !== 'delivered') {
        return res.status(409).json({ error: 'Ratings allowed only on delivered loads' });
      }
      if (!load.assignedDriver) {
        return res.status(409).json({ error: 'Load has no assigned driver' });
      }

      const isShipper = String(load.postedBy) === String(req.user.id) && req.user.role === 'shipper';
      const isDriver = String(load.assignedDriver) === String(req.user.id) && req.user.role === 'driver';
      if (!isShipper && !isDriver) {
        return res.status(403).json({ error: 'Only the shipper or assigned driver can rate this load' });
      }

      const raterRole = isShipper ? 'shipper' : 'driver';
      const rateeId = isShipper ? load.assignedDriver : load.postedBy;

      const already = (load.ratings || []).some((r) => r.raterRole === raterRole);
      if (already) {
        return res.status(409).json({ error: 'You have already rated this load' });
      }

      load.ratings.push({
        raterId: req.user.id,
        rateeId,
        raterRole,
        stars: req.body.stars,
        comment: req.body.comment || '',
      });
      await load.save();
      return res.status(201).json({ message: 'Rating recorded', loadId, raterRole, stars: req.body.stars });
    } catch (error) {
      console.error('Rate load error:', error.message);
      return res.status(500).json({ error: 'Failed to record rating' });
    }
  }
);

// ── Public rating summary for a user ──────────────────────────────────────────
// Aggregates all ratings where the given userId is the ratee.  Used by both
// driver- and shipper-facing UI to display reputation badges.

router.get('/users/:userId/rating-summary', verifyJWT, async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await Load.aggregate([
      { $unwind: '$ratings' },
      { $match: { 'ratings.rateeId': userObjectId } },
      {
        $group: {
          _id: '$ratings.raterRole',
          count: { $sum: 1 },
          avgStars: { $avg: '$ratings.stars' },
        },
      },
    ]);

    let totalCount = 0;
    let weightedSum = 0;
    const byRole = {};
    for (const row of result) {
      byRole[row._id] = { count: row.count, avgStars: Math.round(row.avgStars * 10) / 10 };
      totalCount += row.count;
      weightedSum += row.avgStars * row.count;
    }
    return res.json({
      userId,
      totalCount,
      avgStars: totalCount > 0 ? Math.round((weightedSum / totalCount) * 10) / 10 : null,
      byRole,
    });
  } catch (error) {
    console.error('Rating summary error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
});

// ── Escrow: real money hold via Razorpay Orders ───────────────────────────────
// Flow:
//   1. Shipper calls POST /:loadId/escrow/create — we create a Razorpay Order
//      for the accepted-bid amount (or freightPrice) and persist orderId.
//   2. Frontend opens Razorpay Checkout with the returned orderId + keyId.
//      On success Checkout returns {razorpay_order_id, razorpay_payment_id,
//      razorpay_signature}.
//   3. Shipper calls POST /:loadId/escrow/verify with those fields — we verify
//      the HMAC signature and mark escrow `funded`.
// Release is triggered from POST /:loadId/payment/release above.
//
// When RAZORPAY_KEY_ID/SECRET are not set the create endpoint returns 501 so
// the UI can gracefully show "Pay Offline" as the only option.  This is
// intentional — we don't want to silently fake the hold.

router.post(
  '/:loadId/escrow/create',
  verifyJWT,
  requireRole(['shipper']),
  requireBookingsEnabled(),
  async (req, res) => {
    try {
      if (!razorpay) {
        return res.status(501).json({
          error: 'Escrow not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET',
          code: 'RAZORPAY_NOT_CONFIGURED',
        });
      }
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) return res.status(404).json({ error: 'Load not found' });
      if (String(load.postedBy) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You do not own this load' });
      }
      if (['funded', 'released', 'paid'].includes(load.escrow?.status)) {
        return res.status(409).json({ error: `Escrow already ${load.escrow.status}` });
      }

      // Resolve escrow amount: prefer the accepted bid, fall back to freightPrice.
      let amount = Number(load.freightPrice) || 0;
      if (load.acceptedBidId) {
        const accepted = load.bids.id(load.acceptedBidId);
        if (accepted?.amount) amount = Number(accepted.amount);
      }
      if (!amount || amount <= 0) {
        return res.status(409).json({ error: 'Load does not have a priced bid or freight price' });
      }

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: `escrow_${load.loadId}`.slice(0, 40),
        notes: { loadId: load.loadId, shipperId: String(req.user.id), kind: 'escrow' },
        payment_capture: 1,
      });

      load.escrow = {
        status: 'initiated',
        amount,
        currency: 'INR',
        razorpayOrderId: order.id,
        razorpayPaymentId: '',
        razorpayPayoutId: '',
        releaseMode: '',
        failureReason: '',
        initiatedAt: new Date(),
        fundedAt: null,
        releasedAt: null,
        paidAt: null,
      };
      await load.save();

      return res.json({
        loadId: load.loadId,
        orderId: order.id,
        amount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        escrow: load.escrow,
      });
    } catch (error) {
      console.error('Escrow create error:', error.message);
      return res.status(500).json({ error: 'Failed to create escrow order' });
    }
  }
);

const escrowVerifySchema = Joi.object({
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
});

router.post(
  '/:loadId/escrow/verify',
  verifyJWT,
  requireRole(['shipper']),
  validateBody(escrowVerifySchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) return res.status(404).json({ error: 'Load not found' });
      if (String(load.postedBy) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You do not own this load' });
      }
      if (load.escrow?.status !== 'initiated') {
        return res.status(409).json({ error: `Escrow is ${load.escrow?.status || 'none'}, cannot verify` });
      }
      if (load.escrow.razorpayOrderId !== req.body.razorpay_order_id) {
        return res.status(400).json({ error: 'Order ID mismatch' });
      }
      const ok = verifyRazorpayOrderSignature(req.body);
      if (!ok) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }

      load.escrow.status = 'funded';
      load.escrow.razorpayPaymentId = req.body.razorpay_payment_id;
      load.escrow.fundedAt = new Date();
      await load.save();

      if (load.assignedDriver) {
        notify({
          userId: load.assignedDriver,
          type: 'escrow:funded',
          title: `Escrow funded for ${load.loadId}`,
          body: `₹${Number(load.escrow.amount || 0).toLocaleString('en-IN')} is now held for this trip`,
          link: '/driver',
          meta: { loadId: load.loadId, amount: load.escrow.amount },
        }).catch(() => {});
      }

      return res.json({ message: 'Escrow funded', loadId, escrow: load.escrow });
    } catch (error) {
      console.error('Escrow verify error:', error.message);
      return res.status(500).json({ error: 'Failed to verify escrow payment' });
    }
  }
);

// ── Bind vehicle to load (driver-side) ────────────────────────────────────────
// Lets the assigned driver set / switch the vehicle used for this load so
// the shipper's live-tracking picks up the correct device.  Written as an
// opt-in to the `vehicles` collection (owned by fleet.js) without coupling
// to its schema — the endpoint only verifies the vehicle belongs to the
// caller.

const bindVehicleSchema = Joi.object({
  vehicleId: Joi.string().trim().min(1).max(64).required(),
});

router.post(
  '/:loadId/vehicle',
  verifyJWT,
  requireRole(['driver']),
  validateBody(bindVehicleSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const load = await Load.findOne({ loadId });
      if (!load) return res.status(404).json({ error: 'Load not found' });
      if (!load.assignedDriver || String(load.assignedDriver) !== String(req.user.id)) {
        return res.status(403).json({ error: 'You are not assigned to this load' });
      }
      const owned = await mongoose.connection.db.collection('vehicles').findOne({
        vehicleId: req.body.vehicleId,
        ownerId: String(req.user.id),
      });
      if (!owned) {
        return res.status(404).json({ error: 'Vehicle not found or not owned by you' });
      }
      load.vehicleId = String(req.body.vehicleId);
      await load.save();
      return res.json({ message: 'Vehicle bound to load', loadId, vehicleId: load.vehicleId });
    } catch (error) {
      console.error('Bind vehicle error:', error.message);
      return res.status(500).json({ error: 'Failed to bind vehicle' });
    }
  }
);

export default router;
