import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';

const router = Router();

const route = {
  shipmentId: 'L-001',
  path: [
    { lat: 19.076, lon: 72.8777 },
    { lat: 18.5204, lon: 73.8567 },
    { lat: 17.3871, lon: 78.4917 },
  ],
  eta: '02:20',
  status: 'in-transit',
};

router.use(verifyJWT);

router.get('/locations', (req, res) => {
  res.json({
    shipments: [
      { id: 'L-001', lat: 19.076, lon: 72.8777, eta: '02:20', status: 'in-transit' },
      { id: 'L-002', lat: 12.9716, lon: 77.5946, eta: '04:10', status: 'pickup' },
    ],
  });
});

router.get('/route/:shipmentId', (req, res) => {
  if (req.params.shipmentId !== route.shipmentId) {
    return res.status(404).json({ error: 'Shipment route not found' });
  }
  res.json({ route });
});

router.get('/geofence', (req, res) => {
  res.json({ message: 'Geofence monitoring enabled' });
});

export default router;
