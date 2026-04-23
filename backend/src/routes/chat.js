import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import { Joi, validateBody } from '../middleware/validation.js';
import Load from '../schemas/LoadSchema.js';
import ChatMessage from '../schemas/ChatMessageSchema.js';
import { getIo } from '../utils/socketBus.js';

const router = Router();
router.use(verifyJWT);

const sendMessageSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
});

/**
 * Determine whether the authenticated user is a participant of this load's
 * chat.  Participants are: the posting shipper, the assigned driver, any
 * broker who placed a bid, and admins.
 */
async function canAccessLoadChat(loadId, userId, userRole) {
  if (userRole === 'admin') return { allowed: true };

  const load = await Load.findOne({ loadId })
    .select('postedBy assignedDriver bids')
    .lean();

  if (!load) return { allowed: false, reason: 'Load not found' };

  const id = String(userId);

  if (String(load.postedBy) === id) return { allowed: true };
  if (load.assignedDriver && String(load.assignedDriver) === id) return { allowed: true };

  if (userRole === 'broker') {
    const hasBid = (load.bids || []).some(
      (b) => String(b.bidderId || b.brokerId) === id
    );
    if (hasBid) return { allowed: true };
  }

  return { allowed: false, reason: 'Not authorized to access this chat' };
}

/**
 * GET /api/chat/load/:loadId
 * Returns recent messages for a trip chat, paginated via ?before=<ISO date>.
 */
router.get('/load/:loadId', async (req, res) => {
  try {
    const loadId = String(req.params.loadId);
    const { allowed, reason } = await canAccessLoadChat(loadId, req.user.id, req.user.role);
    if (!allowed) return res.status(403).json({ error: reason });

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const filter = { loadId };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) {
        filter.createdAt = { $lt: before };
      }
    }

    const messages = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Return oldest-first so the client can append to the bottom.
    return res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Chat fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/chat/load/:loadId
 * Send a message to a trip chat.  Emits `chat:message` to the socket.io
 * room `load-chat:<loadId>` so all connected participants receive it live.
 */
router.post('/load/:loadId', validateBody(sendMessageSchema), async (req, res) => {
  try {
    const loadId = String(req.params.loadId);
    const { allowed, reason } = await canAccessLoadChat(loadId, req.user.id, req.user.role);
    if (!allowed) return res.status(403).json({ error: reason });

    const msg = await ChatMessage.create({
      loadId,
      senderId: req.user.id,
      senderName: req.user.name || 'Unknown',
      senderRole: req.user.role,
      text: req.body.text,
    });

    const payload = {
      id: String(msg._id),
      loadId,
      senderId: String(msg.senderId),
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      text: msg.text,
      createdAt: msg.createdAt.toISOString(),
    };

    const io = getIo();
    if (io) {
      io.to(`load-chat:${loadId}`).emit('chat:message', payload);
    }

    return res.status(201).json({ message: payload });
  } catch (error) {
    console.error('Chat send error:', error.message);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
