import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';

const router = Router();

const supportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many support requests. Please try again later.' },
});

const contactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().email().required(),
  message: Joi.string().trim().min(10).max(2000).required(),
});

router.post('/contact', supportLimiter, validateBody(contactSchema), async (req, res) => {
  const { name, email, message } = req.body;

  console.log('Support request:', { name, email, message });
  return res.status(201).json({ message: 'Support request received. Our team will contact you shortly.' });
});

router.get('/tickets', verifyJWT, (req, res) => {
  res.json({ tickets: [{ id: 'T-001', subject: 'GST invoice issue', status: 'open' }] });
});

export default router;
