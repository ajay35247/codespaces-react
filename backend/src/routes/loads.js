import crypto from 'crypto';
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

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.origin) filter.origin = new RegExp(req.query.origin, 'i');
    if (req.query.destination) filter.destination = new RegExp(req.query.destination, 'i');

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
      const load = await Load.findOne({ loadId });
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

export default router;
