import { Router } from 'express';
import { verifyJWT, requireRole } from '../middleware/authorize.js';

const router = Router();

const brokerSummary = {
  openLoads: 38,
  pendingCommissions: 1240000,
  activeContracts: 19,
  dailyMatches: 14,
};

const loads = [
  { id: 'L-101', origin: 'Vadodara', destination: 'Surat', status: 'Open', freight: '₹18,200' },
  { id: 'L-102', origin: 'Hyderabad', destination: 'Chennai', status: 'In transit', freight: '₹25,100' },
  { id: 'L-103', origin: 'Ahmedabad', destination: 'Rajkot', status: 'Pending', freight: '₹12,700' },
];

router.use(verifyJWT, requireRole(['broker', 'admin']));

router.get('/summary', (req, res) => {
  res.json({ brokerSummary });
});

router.get('/loads', (req, res) => {
  res.json({ loads });
});

router.post('/negotiate', (req, res) => {
  const { loadId, proposedRate } = req.body;
  if (!loadId || !proposedRate) {
    return res.status(400).json({ error: 'loadId and proposedRate are required' });
  }
  res.json({ message: 'Rate negotiation saved', loadId, proposedRate });
});

export default router;
