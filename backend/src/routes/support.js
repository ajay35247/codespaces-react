import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';

const router = Router();

router.post('/contact', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required' });
  }

  console.log('Support request:', { name, email, message });
  return res.status(201).json({ message: 'Support request received. Our team will contact you shortly.' });
});

router.get('/tickets', verifyJWT, (req, res) => {
  res.json({ tickets: [{ id: 'T-001', subject: 'GST invoice issue', status: 'open' }] });
});

export default router;
