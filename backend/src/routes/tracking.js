import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';

const router = Router();

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

    const shipments = vehicles.map((v) => ({
      id: v.vehicleId || String(v._id),
      lat: v.currentLocation?.lat,
      lon: v.currentLocation?.lng || v.currentLocation?.lon,
      status: v.status || 'unknown',
      updatedAt: v.updatedAt,
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
        { vehicleId: req.params.vehicleId },
        { projection: { vehicleId: 1, currentLocation: 1, routeHistory: 1, status: 1 } }
      );

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle route not found' });
    }

    return res.json({
      route: {
        vehicleId: vehicle.vehicleId,
        status: vehicle.status,
        currentLocation: vehicle.currentLocation,
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
