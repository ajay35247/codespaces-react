import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';

const router = Router();

const fleetOverview = {
  trucksActive: 84,
  utilization: 72,
  fuelConsumption: '65 km/L',
  maintenanceAlerts: 5,
};

const trucks = [
  { id: 'TRK-101', status: 'In transit', utilization: '78%', nextService: '2026-04-25' },
  { id: 'TRK-204', status: 'Idle', utilization: '54%', nextService: '2026-04-30' },
  { id: 'TRK-309', status: 'Maintenance', utilization: '39%', nextService: '2026-04-18' },
];

router.use(verifyJWT, requireRole(['fleet-manager', 'admin']));

router.get('/overview', (req, res) => {
  res.json({ fleetOverview });
});

router.get('/trucks', (req, res) => {
  res.json({ trucks });
});

router.post('/maintenance', (req, res) => {
  const { truckId, issue } = req.body;
  if (!truckId || !issue) {
    return res.status(400).json({ error: 'truckId and issue are required' });
  }
  res.status(201).json({ message: 'Maintenance request recorded', truckId, issue });
});

export default router;
