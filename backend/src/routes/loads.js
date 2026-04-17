import { Router } from 'express';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { requireBookingsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';

const router = Router();

const bidSchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(128).required(),
  amount: Joi.number().positive().required(),
  brokerId: Joi.string().trim().max(128).optional(),
});

router.get('/', (req, res) => {
  res.json({
    loads: [
      { id: 'L-001', status: 'posted', origin: 'Mumbai', destination: 'Delhi', weight: '18T', truckType: 'Container' },
      { id: 'L-002', status: 'in-transit', origin: 'Bengaluru', destination: 'Hyderabad', weight: '9T', truckType: 'Tanker' },
    ],
  });
});

router.post('/bid', verifyJWT, requireRole(['broker']), requireBookingsEnabled(), validateBody(bidSchema), (req, res) => {
  const { loadId, amount, brokerId } = req.body;
  return res.status(201).json({ message: 'Bid submitted', loadId, amount, brokerId });
});

export default router;
