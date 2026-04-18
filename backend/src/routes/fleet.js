import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';

const router = Router();

const STALE_LOCATION_MS = 10 * 60 * 1000; // 10 minutes

const maintenanceSchema = Joi.object({
  vehicleId: Joi.string().trim().min(1).max(128).required(),
  issue: Joi.string().trim().min(4).max(1000).required(),
});

router.use(verifyJWT, requireRole(['fleet-manager']));

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

    // Verify vehicle belongs to this fleet manager
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
