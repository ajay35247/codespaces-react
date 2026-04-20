import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();

const STALE_LOCATION_MS = 10 * 60 * 1000; // 10 minutes

const ALLOWED_VEHICLE_TYPES = ['truck', 'mini-truck', 'trailer', 'container', 'tanker', 'flatbed', 'reefer'];

const registerVehicleSchema = Joi.object({
  licensePlate: Joi.string().trim().min(4).max(20).uppercase().required(),
  type: Joi.string().valid(...ALLOWED_VEHICLE_TYPES).required(),
  capacity: Joi.number().positive().max(100000).optional(),
  make: Joi.string().trim().max(80).optional(),
  model: Joi.string().trim().max(80).optional(),
  year: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1).optional(),
});

const updateVehicleSchema = Joi.object({
  type: Joi.string().valid(...ALLOWED_VEHICLE_TYPES).optional(),
  capacity: Joi.number().positive().max(100000).optional(),
  make: Joi.string().trim().max(80).optional(),
  model: Joi.string().trim().max(80).optional(),
  year: Joi.number().integer().min(1980).max(new Date().getFullYear() + 1).optional(),
  status: Joi.string().valid('active', 'inactive', 'maintenance').optional(),
}).min(1);

const maintenanceSchema = Joi.object({
  vehicleId: Joi.string().trim().min(1).max(128).required(),
  issue: Joi.string().trim().min(4).max(1000).required(),
});

router.use(verifyJWT, requireRole(['fleet-manager']));

// ── Vehicle Registration ──────────────────────────────────────────────────────

router.post('/vehicles', validateBody(registerVehicleSchema), async (req, res) => {
  try {
    const managerId = req.user.id;
    const { licensePlate, type, capacity, make, model, year } = req.body;

    const db = mongoose.connection.db;
    const existing = await db.collection('vehicles').findOne({
      licensePlate: licensePlate.toUpperCase(),
    });
    if (existing) {
      return res.status(409).json({ error: 'A vehicle with this license plate is already registered' });
    }

    const vehicleId = `VH-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const now = new Date();
    const doc = {
      vehicleId,
      licensePlate: licensePlate.toUpperCase(),
      type,
      capacity: capacity || null,
      make: make || null,
      model: model || null,
      year: year || null,
      ownerId: managerId,
      status: 'active',
      currentLocation: null,
      routeHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('vehicles').insertOne(doc);

    return res.status(201).json({
      vehicle: {
        vehicleId: doc.vehicleId,
        licensePlate: doc.licensePlate,
        type: doc.type,
        capacity: doc.capacity,
        make: doc.make,
        model: doc.model,
        year: doc.year,
        status: doc.status,
        ownerId: doc.ownerId,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error('Vehicle registration error:', error.message);
    return res.status(500).json({ error: 'Failed to register vehicle' });
  }
});

router.patch('/vehicles/:vehicleId', validateBody(updateVehicleSchema), async (req, res) => {
  try {
    const managerId = req.user.id;
    const vehicleId = String(req.params.vehicleId);

    const db = mongoose.connection.db;
    const vehicle = await db.collection('vehicles').findOne({ vehicleId, ownerId: managerId });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found or not owned by you' });
    }

    const allowed = ['type', 'capacity', 'make', 'model', 'year', 'status'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }
    updates.updatedAt = new Date();

    await db.collection('vehicles').updateOne({ vehicleId, ownerId: managerId }, { $set: updates });

    return res.json({ message: 'Vehicle updated', vehicleId, updates });
  } catch (error) {
    console.error('Vehicle update error:', error.message);
    return res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

// ── Fleet Overview ────────────────────────────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const managerId = req.user.id;
    const staleThreshold = new Date(Date.now() - STALE_LOCATION_MS);

    const [myLoads, totalVehicles, activeVehicles] = await Promise.all([
      Load.find({ postedBy: managerId }).select('status').lean(),
      mongoose.connection.db.collection('vehicles').countDocuments({ ownerId: managerId }),
      mongoose.connection.db.collection('vehicles').countDocuments({
        ownerId: managerId,
        status: 'in-transit',
        updatedAt: { $gte: staleThreshold },
      }),
    ]);

    const loadStats = myLoads.reduce((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      overview: {
        totalVehicles,
        activeVehicles,
        postedLoads: loadStats.posted || 0,
        inTransitLoads: loadStats['in-transit'] || 0,
        deliveredLoads: loadStats.delivered || 0,
      },
    });
  } catch (error) {
    console.error('Fleet overview error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch fleet overview' });
  }
});

router.get('/trucks', async (req, res) => {
  try {
    const managerId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const staleThreshold = new Date(Date.now() - STALE_LOCATION_MS);

    const vehicles = await mongoose.connection.db
      .collection('vehicles')
      .find(
        { ownerId: managerId },
        {
          projection: {
            _id: 1,
            vehicleId: 1,
            status: 1,
            currentLocation: 1,
            updatedAt: 1,
            licensePlate: 1,
            type: 1,
          },
        }
      )
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await mongoose.connection.db
      .collection('vehicles')
      .countDocuments({ ownerId: managerId });

    const trucks = vehicles.map((v) => ({
      id: v.vehicleId || String(v._id),
      licensePlate: v.licensePlate || null,
      type: v.type || null,
      status: v.status || 'unknown',
      currentLocation: v.currentLocation || null,
      isStale: v.updatedAt ? v.updatedAt < staleThreshold : true,
      updatedAt: v.updatedAt || null,
    }));

    return res.json({
      trucks,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Fleet trucks error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch fleet trucks' });
  }
});

router.post('/maintenance', validateBody(maintenanceSchema), async (req, res) => {
  try {
    const { vehicleId, issue } = req.body;
    const managerId = req.user.id;

    const vehicle = await mongoose.connection.db
      .collection('vehicles')
      .findOne({ vehicleId: String(vehicleId), ownerId: managerId });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found or not owned by you' });
    }

    const request = {
      vehicleId: String(vehicleId),
      issue,
      reportedBy: managerId,
      status: 'open',
      createdAt: new Date(),
    };

    await mongoose.connection.db.collection('maintenance_requests').insertOne(request);

    return res.status(201).json({
      message: 'Maintenance request recorded',
      vehicleId,
      issue,
      status: 'open',
    });
  } catch (error) {
    console.error('Fleet maintenance error:', error.message);
    return res.status(500).json({ error: 'Failed to record maintenance request' });
  }
});

export default router;
