import { Response } from 'express';
import { Vehicle } from '../models/Vehicle';
import { AuthRequest } from '../middleware/auth';
import { MatchingEngine } from '../services/MatchingEngine';

const matchingEngine = new MatchingEngine(null); // Will inject NotificationService later

export const registerVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const vehicleData = {
      ...req.body,
      ownerId: req.user._id,
      brokerId: req.body.brokerId || undefined
    };

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    // Trigger matching for existing loads
    await matchingEngine.matchVehicleToLoads(vehicle._id.toString());

    res.status(201).json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Register vehicle error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Vehicle number already exists.' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const vehicle = await Vehicle.findOne({ _id: id, $or: [{ ownerId: req.user._id }, { brokerId: req.user._id }] });
    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found or access denied.' });
    }

    Object.assign(vehicle, updates);
    await vehicle.save();

    // If availability changed, trigger matching
    if (updates.availabilityStatus || updates.emptyTruckStatus) {
      if (vehicle.availabilityStatus === 'available' && vehicle.emptyTruckStatus === 'empty') {
        await matchingEngine.matchVehicleToLoads(vehicle._id.toString());
      }
    }

    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserVehicles = async (req: AuthRequest, res: Response) => {
  try {
    const vehicles = await Vehicle.find({
      $or: [{ ownerId: req.user._id }, { brokerId: req.user._id }]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: vehicles
    });
  } catch (error) {
    console.error('Get user vehicles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVehicleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findById(id);

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }

    // Check if user has access
    if (vehicle.ownerId.toString() !== req.user._id.toString() &&
        vehicle.brokerId?.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    console.error('Get vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteVehicle = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const vehicle = await Vehicle.findOneAndDelete({
      _id: id,
      $or: [{ ownerId: req.user._id }, { brokerId: req.user._id }]
    });

    if (!vehicle) {
      return res.status(404).json({ error: 'Vehicle not found or access denied.' });
    }

    res.json({
      success: true,
      message: 'Vehicle deleted successfully.'
    });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};