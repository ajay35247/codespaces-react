import crypto from 'crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyJWT } from '../middleware/authorize.js';
import { requireSupportEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import SupportTicket from '../schemas/SupportTicketSchema.js';

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
  subject: Joi.string().trim().min(4).max(200).required(),
  message: Joi.string().trim().min(10).max(2000).required(),
});

function generateTicketNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${ts}-${rand}`;
}

router.post('/contact', supportLimiter, requireSupportEnabled(), validateBody(contactSchema), async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    const ticketNumber = generateTicketNumber();
    const ticket = await SupportTicket.create({
      ticketNumber,
      name,
      email,
      subject,
      message,
      status: 'open',
    });

    return res.status(201).json({
      message: 'Support request received. Our team will contact you shortly.',
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error) {
    console.error('Support contact error:', error.message);
    return res.status(500).json({ error: 'Failed to submit support request' });
  }
});

router.get('/tickets', verifyJWT, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = { email: req.user.email };
    if (req.query.status) {
      const allowed = new Set(['open', 'in-progress', 'resolved', 'closed']);
      if (allowed.has(String(req.query.status))) {
        filter.status = String(req.query.status);
      }
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .select('-message')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    return res.json({
      tickets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Support tickets error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/tickets/:ticketNumber', verifyJWT, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      ticketNumber: String(req.params.ticketNumber),
      email: req.user.email,
    }).lean();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    return res.json({ ticket });
  } catch (error) {
    console.error('Support ticket detail error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

export default router;
