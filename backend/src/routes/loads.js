import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    loads: [
      { id: 'L-001', status: 'posted', origin: 'Mumbai', destination: 'Delhi', weight: '18T', truckType: 'Container' },
      { id: 'L-002', status: 'in-transit', origin: 'Bengaluru', destination: 'Hyderabad', weight: '9T', truckType: 'Tanker' },
    ],
  });
});

router.post('/bid', (req, res) => {
  const { loadId, amount, brokerId } = req.body;
  if (!loadId || !amount) {
    return res.status(400).json({ error: 'loadId and amount are required' });
  }
  return res.status(201).json({ message: 'Bid submitted', loadId, amount, brokerId });
});

export default router;
