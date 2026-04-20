import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { requireBookingsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();

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

const assignDriverSchema = Joi.object({
  driverId: Joi.string().trim().min(1).max(128).required(),
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

router.post(
  '/',
  verifyJWT,
  requireRole(['shipper', 'fleet-manager']),
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

router.post(
  '/bid',
  verifyJWT,
  requireRole(['broker']),
  requireBookingsEnabled(),
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
      const existingBid = load.bids.find((b) => String(b.brokerId) === String(req.user.id));
      if (existingBid) {
        return res.status(409).json({ error: 'You have already placed a bid on this load' });
      }
      load.bids.push({ brokerId: req.user.id, amount, currency: 'INR' });
      await load.save();
      return res.status(201).json({
        message: 'Bid submitted',
        loadId,
        amount,
        brokerId: req.user.id,
      });
    } catch (error) {
      console.error('Bid submission error:', error.message);
      return res.status(500).json({ error: 'Failed to submit bid' });
    }
  }
);

// ── Own loads (shipper / fleet-manager) ──────────────────────────────────────

router.get(
  '/mine',
  verifyJWT,
  requireRole(['shipper', 'fleet-manager', 'driver']),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
      const skip = (page - 1) * limit;

      let filter;
      if (req.user.role === 'driver') {
        filter = { assignedDriver: new mongoose.Types.ObjectId(req.user.id) };
      } else {
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

// ── Update load status ────────────────────────────────────────────────────────

router.patch(
  '/:loadId/status',
  verifyJWT,
  requireRole(['shipper', 'fleet-manager', 'driver']),
  validateBody(updateStatusSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const { status } = req.body;

      const load = await Load.findOne({ loadId });
      if (!load) {
        return res.status(404).json({ error: 'Load not found' });
      }

      // Authorization: shipper/fleet-manager must own the load; driver must be assigned
      if (req.user.role === 'driver') {
        if (!load.assignedDriver || String(load.assignedDriver) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You are not assigned to this load' });
        }
        // Drivers can only move: in-transit → delivered
        if (load.status !== 'in-transit' || status !== 'delivered') {
          return res.status(409).json({ error: 'Drivers can only mark in-transit loads as delivered' });
        }
      } else {
        if (String(load.postedBy) !== String(req.user.id)) {
          return res.status(403).json({ error: 'You do not own this load' });
        }
      }

      load.status = status;
      await load.save();

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
  requireRole(['shipper', 'fleet-manager']),
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
      await load.save();

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
  requireRole(['shipper', 'fleet-manager']),
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

router.post(
  '/:loadId/assign',
  verifyJWT,
  requireRole(['fleet-manager']),
  validateBody(assignDriverSchema),
  async (req, res) => {
    try {
      const loadId = String(req.params.loadId);
      const { driverId } = req.body;

      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.status(400).json({ error: 'Invalid driver ID' });
      }

      const load = await Load.findOne({ loadId, postedBy: req.user.id });
      if (!load) {
        return res.status(404).json({ error: 'Load not found or not owned by you' });
      }
      if (!['posted', 'in-transit'].includes(load.status)) {
        return res.status(409).json({ error: 'Cannot assign driver to a completed or cancelled load' });
      }

      load.assignedDriver = new mongoose.Types.ObjectId(driverId);
      if (load.status === 'posted') {
        load.status = 'in-transit';
      }
      await load.save();

      return res.json({ message: 'Driver assigned', loadId, driverId });
    } catch (error) {
      console.error('Driver assignment error:', error.message);
      return res.status(500).json({ error: 'Failed to assign driver' });
    }
  }
);

export default router;
