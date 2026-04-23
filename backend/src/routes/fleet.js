import crypto from 'crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { requireRole, verifyJWT } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';
import User from '../schemas/UserSchema.js';
import Load from '../schemas/LoadSchema.js';
import { notify } from '../services/notifications.js';

const router = Router();

// `vehicles` is a loose collection (not a Mongoose model) because it's
// written to directly by the socket.io update-location handler (see
// backend/src/index.js) and by loads.js bid-accept auto-bind.  We keep
// the schema loose but enforce a consistent shape here.
function vehiclesCollection() {
  return mongoose.connection.db.collection('vehicles');
}

const createVehicleSchema = Joi.object({
  licensePlate: Joi.string().trim().min(2).max(32).required(),
  type: Joi.string().trim().min(2).max(64).required(),
  capacityTons: Joi.number().positive().max(200).optional(),
  notes: Joi.string().trim().max(500).allow('').optional(),
});

const updateVehicleSchema = Joi.object({
  licensePlate: Joi.string().trim().min(2).max(32).optional(),
  type: Joi.string().trim().min(2).max(64).optional(),
  capacityTons: Joi.number().positive().max(200).optional(),
  notes: Joi.string().trim().max(500).allow('').optional(),
  active: Joi.boolean().optional(),
}).min(1);

const assignDriverSchema = Joi.object({
  loadId: Joi.string().trim().min(1).max(128).required(),
  driverId: Joi.string().trim().length(24).required(),
  vehicleId: Joi.string().trim().min(1).max(64).optional(),
});

// ── CRUD on vehicles (owner-scoped) ──────────────────────────────────────────

router.get('/vehicles', verifyJWT, requireRole(['truck_owner']), async (req, res) => {
  try {
    const ownerId = String(req.user.id);
    const vehicles = await vehiclesCollection()
      .find({ ownerId })
      .project({ routeHistory: 0 })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    return res.json({ vehicles });
  } catch (error) {
    console.error('Fleet list error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post(
  '/vehicles',
  verifyJWT,
  requireRole(['truck_owner']),
  validateBody(createVehicleSchema),
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
        notes: req.body.notes || '',
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
      console.error('Fleet create error:', error.message);
      return res.status(500).json({ error: 'Failed to add vehicle' });
    }
  }
);

router.patch(
  '/vehicles/:vehicleId',
  verifyJWT,
  requireRole(['truck_owner']),
  validateBody(updateVehicleSchema),
  async (req, res) => {
    try {
      const ownerId = String(req.user.id);
      const vehicleId = String(req.params.vehicleId);
      const updates = { ...req.body, updatedAt: new Date() };
      const result = await vehiclesCollection().findOneAndUpdate(
        { vehicleId, ownerId },
        { $set: updates },
        { returnDocument: 'after', projection: { routeHistory: 0 } }
      );
      const vehicle = result?.value || result; // driver 4 vs 5 shape
      if (!vehicle) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      return res.json({ vehicle });
    } catch (error) {
      console.error('Fleet update error:', error.message);
      return res.status(500).json({ error: 'Failed to update vehicle' });
    }
  }
);

router.delete(
  '/vehicles/:vehicleId',
  verifyJWT,
  requireRole(['truck_owner']),
  async (req, res) => {
    try {
      const ownerId = String(req.user.id);
      const vehicleId = String(req.params.vehicleId);
      // Refuse to delete a vehicle that is currently bound to an in-transit
      // load — the shipper is actively tracking it.
      const active = await Load.findOne({ vehicleId, status: 'in-transit' }).select('loadId').lean();
      if (active) {
        return res.status(409).json({
          error: `Vehicle is in-transit on load ${active.loadId}`,
          code: 'VEHICLE_IN_USE',
        });
      }
      const result = await vehiclesCollection().deleteOne({ vehicleId, ownerId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }
      return res.json({ ok: true });
    } catch (error) {
      console.error('Fleet delete error:', error.message);
      return res.status(500).json({ error: 'Failed to delete vehicle' });
    }
  }
);

// ── Dashboard summary (assignments + earnings) ───────────────────────────────
// Earnings are derived from delivered loads where the assignedDriver's
// latest vehicle belongs to this owner.  This is the honest proxy we can
// compute today; a richer split (owner vs driver share) would need a
// commission policy that doesn't exist in the schema yet — deliberately
// NOT faked here.

router.get('/overview', verifyJWT, requireRole(['truck_owner']), async (req, res) => {
  try {
    const ownerId = String(req.user.id);
    const ownerVehicles = await vehiclesCollection()
      .find({ ownerId })
      .project({ vehicleId: 1, licensePlate: 1, active: 1, _id: 0 })
      .toArray();
    const vehicleIds = ownerVehicles.map((v) => v.vehicleId);

    const [assigned, delivered] = await Promise.all([
      Load.find({ vehicleId: { $in: vehicleIds }, status: 'in-transit' })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Load.find({ vehicleId: { $in: vehicleIds }, status: 'delivered' })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    // Sum the accepted-bid amount (falls back to freightPrice) across
    // delivered loads — this is the gross revenue tied to the fleet.
    let grossEarnings = 0;
    for (const load of delivered) {
      let amount = Number(load.freightPrice) || 0;
      if (load.acceptedBidId && Array.isArray(load.bids)) {
        const accepted = load.bids.find((b) => String(b._id) === String(load.acceptedBidId));
        if (accepted?.amount) amount = Number(accepted.amount);
      }
      grossEarnings += amount || 0;
    }

    return res.json({
      vehicleCount: ownerVehicles.length,
      activeVehicleCount: ownerVehicles.filter((v) => v.active !== false).length,
      assignedLoadCount: assigned.length,
      deliveredLoadCount: delivered.length,
      grossEarnings,
      currency: 'INR',
      assignedLoads: assigned.map((l) => ({
        loadId: l.loadId,
        origin: l.origin,
        destination: l.destination,
        vehicleId: l.vehicleId,
        assignedDriver: l.assignedDriver,
        status: l.status,
        createdAt: l.createdAt,
      })),
    });
  } catch (error) {
    console.error('Fleet overview error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch fleet overview' });
  }
});

// ── Assign a driver to a load ────────────────────────────────────────────────
// A truck-owner can assign one of their drivers to a load *they* posted
// (truck-owners can also post loads on behalf of their fleet), or to a load
// where one of their vehicles is already bound.  Refuses to steal loads
// belonging to other shippers.

router.post(
  '/assign-driver',
  verifyJWT,
  requireRole(['truck_owner']),
  validateBody(assignDriverSchema),
  async (req, res) => {
    try {
      const ownerId = String(req.user.id);
      const { loadId, driverId } = req.body;
      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.status(400).json({ error: 'Invalid driver ID' });
      }

      const load = await Load.findOne({ loadId: String(loadId) });
      if (!load) return res.status(404).json({ error: 'Load not found' });

      // Authorisation: owner posted the load, OR one of their vehicles
      // is already bound to the load.
      const ownsLoad = String(load.postedBy) === ownerId;
      let ownsVehicle = false;
      if (!ownsLoad && load.vehicleId) {
        const match = await vehiclesCollection().findOne(
          { vehicleId: load.vehicleId, ownerId },
          { projection: { _id: 1 } }
        );
        ownsVehicle = Boolean(match);
      }
      if (!ownsLoad && !ownsVehicle) {
        return res.status(403).json({ error: 'You do not manage this load' });
      }
      if (['delivered', 'cancelled'].includes(load.status)) {
        return res.status(409).json({ error: `Load is ${load.status}` });
      }

      const driver = await User.findById(driverId).select('role accountStatus name').lean();
      if (!driver || driver.role !== 'driver') {
        return res.status(404).json({ error: 'Driver not found' });
      }
      if (driver.accountStatus && driver.accountStatus !== 'active') {
        return res.status(409).json({ error: 'Driver account is not active' });
      }

      load.assignedDriver = new mongoose.Types.ObjectId(driverId);
      if (req.body.vehicleId) {
        // Only bind a vehicle that the owner actually owns.
        const owned = await vehiclesCollection().findOne(
          { vehicleId: String(req.body.vehicleId), ownerId },
          { projection: { _id: 1 } }
        );
        if (!owned) {
          return res.status(404).json({ error: 'Vehicle not found in your fleet' });
        }
        load.vehicleId = String(req.body.vehicleId);
      }
      if (load.status === 'posted') {
        // Manual owner-driven assignment flips the load to in-transit,
        // matching the existing bid-accept flow.
        load.status = 'in-transit';
      }
      await load.save();

      // Notify the driver they've been assigned.
      notify({
        userId: driverId,
        type: 'load:status',
        title: 'You were assigned a new load',
        body: `${load.origin} → ${load.destination}`,
        link: `/driver`,
        meta: { loadId: load.loadId },
      }).catch(() => {});

      return res.json({
        message: 'Driver assigned',
        loadId: load.loadId,
        assignedDriver: driverId,
        vehicleId: load.vehicleId || null,
        status: load.status,
      });
    } catch (error) {
      console.error('Fleet assign driver error:', error.message);
      return res.status(500).json({ error: 'Failed to assign driver' });
    }
  }
);

export default router;
