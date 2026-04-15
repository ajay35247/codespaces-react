import { Router } from 'express';
import { MatchingEngine } from '../services/matchingEngine.js';

const router = Router();

router.post('/load', async (req, res) => {
  const { loadId } = req.body;
  if (!loadId) {
    return res.status(400).json({ error: 'loadId is required' });
  }

  try {
    await MatchingEngine.scheduleLoadMatching(loadId);
    return res.status(202).json({ success: true, message: 'Load matching queued' });
  } catch (error) {
    console.error('Queue load matching error:', error);
    return res.status(500).json({ error: 'Unable to queue load matching' });
  }
});

router.post('/vehicle', async (req, res) => {
  const { vehicleId } = req.body;
  if (!vehicleId) {
    return res.status(400).json({ error: 'vehicleId is required' });
  }

  try {
    await MatchingEngine.scheduleVehicleMatching(vehicleId);
    return res.status(202).json({ success: true, message: 'Vehicle matching queued' });
  } catch (error) {
    console.error('Queue vehicle matching error:', error);
    return res.status(500).json({ error: 'Unable to queue vehicle matching' });
  }
});

export default router;