import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';

const router = Router();

/** GPS data older than this is marked stale */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

router.use(verifyJWT);

router.get('/locations', async (req, res) => {
  try {
    const vehicles = await mongoose.connection.db
      .collection('vehicles')
      .find(
        { currentLocation: { $exists: true } },
        { projection: { _id: 1, vehicleId: 1, currentLocation: 1, status: 1, updatedAt: 1 } }
      )
      .limit(100)
      .toArray();

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    const shipments = vehicles.map((v) => ({
      id: v.vehicleId || String(v._id),
      lat: v.currentLocation?.lat,
      lon: v.currentLocation?.lng || v.currentLocation?.lon,
      status: v.status || 'unknown',
      updatedAt: v.updatedAt || null,
      isStale: v.updatedAt ? v.updatedAt < staleThreshold : true,
    }));

    return res.json({ shipments });
  } catch (error) {
    console.error('Tracking locations error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

router.get('/route/:vehicleId', async (req, res) => {
  try {
    const vehicle = await mongoose.connection.db
      .collection('vehicles')
      .findOne(
        { vehicleId: String(req.params.vehicleId) },
        { projection: { vehicleId: 1, currentLocation: 1, routeHistory: 1, status: 1, updatedAt: 1 } }
      );

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle route not found' });
    }

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    return res.json({
      route: {
        vehicleId: vehicle.vehicleId,
        status: vehicle.status,
        currentLocation: vehicle.currentLocation || null,
        isStale: vehicle.updatedAt ? vehicle.updatedAt < staleThreshold : true,
        updatedAt: vehicle.updatedAt || null,
        path: vehicle.routeHistory || [],
      },
    });
  } catch (error) {
    console.error('Tracking route error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch route' });
  }
});

router.get('/geofence', (req, res) => {
  res.json({ message: 'Geofence monitoring enabled' });
});

export default router;
