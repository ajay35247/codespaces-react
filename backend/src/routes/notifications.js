import mongoose from 'mongoose';
import { Router } from 'express';
import { verifyJWT } from '../middleware/authorize.js';
import Notification from '../schemas/NotificationSchema.js';

const router = Router();

// Hard cap on page size — keep the dropdown responsive and guard against
// a malicious client requesting a 10 000-row page.
const MAX_PAGE_SIZE = 50;

/**
 * List the caller's notifications, newest first.
 * Query params:
 *   ?limit=20      (default 20, max 50)
 *   ?before=<ISO>  fetch notifications strictly older than this timestamp
 *                  (enables cursor pagination without exposing skip-based
 *                   denial-of-service).
 *   ?unread=1      only return notifications with readAt=null
 */
router.get('/', verifyJWT, async (req, res) => {
  try {
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const filter = { userId: new mongoose.Types.ObjectId(req.user.id) };
    if (req.query.before) {
      const beforeDate = new Date(String(req.query.before));
      if (!Number.isNaN(beforeDate.getTime())) {
        filter.createdAt = { $lt: beforeDate };
      }
    }
    if (req.query.unread === '1' || req.query.unread === 'true') {
      filter.readAt = null;
    }

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId: filter.userId, readAt: null }),
    ]);

    return res.json({ notifications: items, unreadCount });
  } catch (error) {
    console.error('Notifications list error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.post('/:id/read', verifyJWT, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    const result = await Notification.updateOne(
      { _id: req.params.id, userId: req.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    if (result.matchedCount === 0) {
      // Either not found or already read — both map to 404 so an attacker
      // can't distinguish "exists but not yours" from "doesn't exist".
      return res.status(404).json({ error: 'Notification not found' });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error('Notification read error:', error.message);
    return res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

router.post('/read-all', verifyJWT, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return res.json({ ok: true, updated: result.modifiedCount || 0 });
  } catch (error) {
    console.error('Notifications read-all error:', error.message);
    return res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

export default router;
