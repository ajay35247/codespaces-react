import { Router } from 'express';
import { MatchingEngine } from '../services/matchingEngine.js';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';

const router = Router();

const matchingSchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(128),
  vehicleId: Joi.string().trim().min(1).max(128),
}).xor('loadId', 'vehicleId');

router.use(verifyJWT, requireRole(['broker', 'fleet-manager', 'admin']));

router.post('/load', validateBody(matchingSchema), async (req, res) => {
  const { loadId } = req.body;

  try {
    await MatchingEngine.scheduleLoadMatching(loadId);
    return res.status(202).json({ success: true, message: 'Load matching queued' });
  } catch (error) {
    console.error('Queue load matching error:', error);
    return res.status(500).json({ error: 'Unable to queue load matching' });
  }
});

router.post('/vehicle', validateBody(matchingSchema), async (req, res) => {
  const { vehicleId } = req.body;

  try {
    await MatchingEngine.scheduleVehicleMatching(vehicleId);
    return res.status(202).json({ success: true, message: 'Vehicle matching queued' });
  } catch (error) {
    console.error('Queue vehicle matching error:', error);
    return res.status(500).json({ error: 'Unable to queue vehicle matching' });
  }
});

export default router;