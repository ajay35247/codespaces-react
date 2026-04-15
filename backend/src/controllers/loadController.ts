import { Response } from 'express';
import { Load } from '../models/Load';
import { AuthRequest } from '../middleware/auth';
import { MatchingEngine } from '../services/MatchingEngine';

const matchingEngine = new MatchingEngine(null); // Will inject later

export const postLoad = async (req: AuthRequest, res: Response) => {
  try {
    const loadData = {
      ...req.body,
      shipperId: req.user._id
    };

    const load = new Load(loadData);
    await load.save();

    // Trigger matching
    await matchingEngine.matchLoadToVehicles(load._id.toString());

    res.status(201).json({
      success: true,
      data: load
    });
  } catch (error) {
    console.error('Post load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserLoads = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const loads = await Load.find({ shipperId: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('matchedVehicles', 'vehicleNumber vehicleCategory capacityTon');

    const total = await Load.countDocuments({ shipperId: req.user._id });

    res.json({
      success: true,
      data: loads,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get user loads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLoadById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const load = await Load.findById(id).populate('matchedVehicles', 'vehicleNumber vehicleCategory capacityTon currentLocation');

    if (!load) {
      return res.status(404).json({ error: 'Load not found.' });
    }

    // Check access
    if (load.shipperId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({
      success: true,
      data: load
    });
  } catch (error) {
    console.error('Get load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateLoad = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const load = await Load.findOne({ _id: id, shipperId: req.user._id });
    if (!load) {
      return res.status(404).json({ error: 'Load not found or access denied.' });
    }

    Object.assign(load, updates);
    await load.save();

    // Re-trigger matching if load details changed
    if (updates.vehicleRequired || updates.loadWeight || updates.urgent) {
      await matchingEngine.matchLoadToVehicles(load._id.toString());
    }

    res.json({
      success: true,
      data: load
    });
  } catch (error) {
    console.error('Update load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteLoad = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const load = await Load.findOneAndDelete({ _id: id, shipperId: req.user._id });

    if (!load) {
      return res.status(404).json({ error: 'Load not found or access denied.' });
    }

    res.json({
      success: true,
      message: 'Load deleted successfully.'
    });
  } catch (error) {
    console.error('Delete load error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMatchingVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const load = await Load.findById(id);

    if (!load) {
      return res.status(404).json({ error: 'Load not found.' });
    }

    // Only shipper or admin can see matching vehicles
    if (load.shipperId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const vehicles = await Vehicle.find({
      _id: { $in: load.matchedVehicles },
      availabilityStatus: 'available',
      emptyTruckStatus: 'empty'
    }).select('vehicleNumber vehicleCategory capacityTon currentLocation availabilityStatus emptyTruckStatus');

    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    console.error('Get matching vehicles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};