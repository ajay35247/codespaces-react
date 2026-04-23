import Notification from '../schemas/NotificationSchema.js';
import { emitToUser } from '../utils/socketBus.js';

/**
 * Persist a notification and push it into the recipient's socket room.
 *
 * Writes are best-effort: if the DB is unavailable or validation fails
 * we log and return null rather than bubble up, because the originating
 * request (e.g. placing a bid) must not fail just because the notification
 * side-effect could not be delivered.
 *
 * @param {object} params
 * @param {string|ObjectId} params.userId Recipient user id.
 * @param {string} params.type Short type code (see NotificationSchema comment).
 * @param {string} params.title Headline shown in the bell dropdown.
 * @param {string} [params.body] Optional longer description.
 * @param {string} [params.link] Optional deep-link the UI should open on click.
 * @param {object} [params.meta] Optional structured payload (loadId, amount, …).
 * @returns {Promise<object|null>} the created Notification doc (lean) or null.
 */
export async function notify({ userId, type, title, body = '', link = '', meta = null }) {
  if (!userId || !type || !title) return null;
  try {
    const doc = await Notification.create({
      userId,
      type: String(type).slice(0, 64),
      title: String(title).slice(0, 200),
      body: String(body || '').slice(0, 1000),
      link: String(link || '').slice(0, 500),
      meta: meta || null,
    });
    const payload = {
      id: String(doc._id),
      type: doc.type,
      title: doc.title,
      body: doc.body,
      link: doc.link,
      meta: doc.meta,
      createdAt: doc.createdAt,
      readAt: doc.readAt,
    };
    emitToUser(userId, 'notification', payload);
    return payload;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('notify() failed:', err.message);
    return null;
  }
}

/**
 * Emit an arbitrary live-update event to a user (e.g. `load:status-changed`)
 * without persisting it as a Notification.  Used when the client already has
 * the load in memory and we just need to tell it to refresh that slice.
 */
export function pushLive(userId, event, payload) {
  if (!userId || !event) return;
  emitToUser(userId, event, payload);
}
