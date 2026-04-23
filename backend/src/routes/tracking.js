import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { requireTrackingEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();

/** GPS data older than this is marked stale */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

router.use(verifyJWT, requireTrackingEnabled());

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

// ── Driver-owned vehicles ─────────────────────────────────────────────────────
// Drivers need a vehicleId they *own* (vehicles.ownerId === user.id) so that
// the socket.io `update-location` handler will accept their GPS pings.  The
// existing /api/fleet routes are gated to truck_owner; this pair of endpoints
// lets drivers (and truck_owners) manage their own driving vehicle directly
// without signing up as a fleet operator.  Written against the loose
// `vehicles` collection so schema stays compatible with fleet.js.

function vehiclesCollection() {
  return mongoose.connection.db.collection('vehicles');
}

const createMyVehicleSchema = Joi.object({
  licensePlate: Joi.string().trim().min(2).max(32).required(),
  type: Joi.string().trim().min(2).max(64).required(),
  capacityTons: Joi.number().positive().max(200).optional(),
});

router.get(
  '/my-vehicles',
  requireRole(['driver', 'truck_owner']),
  async (req, res) => {
    try {
      const ownerId = String(req.user.id);
      const vehicles = await vehiclesCollection()
        .find({ ownerId })
        .project({ routeHistory: 0 })
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
      return res.json({ vehicles });
    } catch (error) {
      console.error('my-vehicles fetch error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
  }
);

router.post(
  '/my-vehicles',
  requireRole(['driver', 'truck_owner']),
  validateBody(createMyVehicleSchema),
  async (req, res) => {
    try {
      const ownerId = String(req.user.id);
      const vehicleId = `V-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const now = new Date();
      const doc = {
        vehicleId,
        ownerId,
        licensePlate: req.body.licensePlate,
        type: req.body.type,
        capacityTons: req.body.capacityTons || null,
        active: true,
        currentLocation: null,
        routeHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      await vehiclesCollection().insertOne(doc);
      const { _id, routeHistory, ...rest } = doc;
      return res.status(201).json({ vehicle: rest });
    } catch (error) {
      console.error('my-vehicles create error:', error.message);
      return res.status(500).json({ error: 'Failed to register vehicle' });
    }
  }
);

/**
 * Per-load tracking: returns the latest location + recent route path for
 * the vehicle currently bound to the given load.  Only the load's shipper
 * or assigned driver may read; everyone else gets 403.  Used by the
 * ShipperWorkflow "Track live" link to jump straight into tracking for a
 * single load instead of the full fleet view.
 */
router.get('/load/:loadId', async (req, res) => {
  try {
    const loadId = String(req.params.loadId);
    const load = await Load
      .findOne({ loadId })
      .select('postedBy assignedDriver vehicleId status origin destination');
    if (!load) return res.status(404).json({ error: 'Load not found' });

    const isShipper = String(load.postedBy) === String(req.user.id);
    const isDriver = load.assignedDriver && String(load.assignedDriver) === String(req.user.id);
    if (!isShipper && !isDriver) {
      return res.status(403).json({ error: 'Not authorized to track this load' });
    }
    if (!load.vehicleId) {
      return res.status(404).json({
        error: 'No vehicle bound to this load yet',
        code: 'NO_VEHICLE',
        load: { loadId, status: load.status, origin: load.origin, destination: load.destination },
      });
    }

    const vehicle = await mongoose.connection.db
      .collection('vehicles')
      .findOne(
        { vehicleId: String(load.vehicleId) },
        { projection: { vehicleId: 1, currentLocation: 1, routeHistory: 1, status: 1, updatedAt: 1 } }
      );
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    return res.json({
      load: {
        loadId,
        status: load.status,
        origin: load.origin,
        destination: load.destination,
        vehicleId: load.vehicleId,
      },
      tracking: vehicle
        ? {
          vehicleId: vehicle.vehicleId,
          status: vehicle.status,
          currentLocation: vehicle.currentLocation || null,
          isStale: vehicle.updatedAt ? vehicle.updatedAt < staleThreshold : true,
          updatedAt: vehicle.updatedAt || null,
          path: vehicle.routeHistory || [],
        }
        : null,
    });
  } catch (error) {
    console.error('Tracking load error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch load tracking' });
  }
});

export default router;
