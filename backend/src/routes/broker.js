import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { requireBookingsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();

const negotiateSchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(128).required(),
  proposedRate: Joi.number().positive().required(),
});

router.use(verifyJWT, requireRole(['broker']));

router.get('/summary', async (req, res) => {
  try {
    const brokerId = req.user.id;

    const [openLoads, loadsWithMyBids] = await Promise.all([
      Load.countDocuments({ status: 'posted' }),
      Load.find({ 'bids.brokerId': brokerId })
        .select('status bids')
        .lean(),
    ]);

    let pendingBids = 0;
    let acceptedBids = 0;
    for (const load of loadsWithMyBids) {
      for (const bid of load.bids) {
        if (String(bid.brokerId) === String(brokerId)) {
          if (bid.status === 'pending') pendingBids += 1;
          if (bid.status === 'accepted') acceptedBids += 1;
        }
      }
    }

    return res.json({
      summary: {
        openLoads,
        pendingBids,
        acceptedBids,
        activeContracts: acceptedBids,
      },
    });
  } catch (error) {
    console.error('Broker summary error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch broker summary' });
  }
});

router.get('/loads', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [loads, total] = await Promise.all([
      Load.find({ status: 'posted' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Load.countDocuments({ status: 'posted' }),
    ]);

    return res.json({
      loads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Broker loads error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch available loads' });
  }
});

router.post('/negotiate', requireBookingsEnabled(), validateBody(negotiateSchema), async (req, res) => {
  try {
    const { loadId, proposedRate } = req.body;
    const brokerId = req.user.id;

    const load = await Load.findOne({ loadId: String(loadId) });
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }
    if (load.status !== 'posted') {
      return res.status(409).json({ error: 'This load is no longer accepting bids' });
    }

    const existingBidIndex = load.bids.findIndex((b) => String(b.brokerId) === String(brokerId));
    if (existingBidIndex >= 0) {
      // Update existing bid amount
      load.bids[existingBidIndex].amount = proposedRate;
    } else {
      load.bids.push({ brokerId, amount: proposedRate, currency: 'INR' });
    }

    await load.save();
    return res.json({ message: 'Rate negotiation saved', loadId, proposedRate });
  } catch (error) {
    console.error('Broker negotiate error:', error.message);
    return res.status(500).json({ error: 'Failed to save negotiation' });
  }
});

export default router;
