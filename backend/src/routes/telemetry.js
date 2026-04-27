import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import ErrorEvent from '../schemas/ErrorEventSchema.js';
import { fingerprintError } from '../utils/errorFingerprint.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { alertOnErrorEvent } from '../services/alerts.js';

const router = Router();

// Hard caps to prevent abuse — a hostile client could try to fill the
// collection with garbage; we cap payload sizes at the route level too.
const MAX_BATCH_SIZE = 20;
const MAX_MESSAGE_LEN = 2000;
const MAX_STACK_LEN = 16000;
const MAX_COMPONENT_STACK_LEN = 8000;
const MAX_BREADCRUMBS = 50;
const MAX_ROUTE_LEN = 500;
const ALLOWED_SEVERITIES = new Set(['fatal', 'error', 'warning', 'info']);

// IP-based rate limit: even anonymous visitors can post errors but a single
// IP cannot post more than 60 events / minute, preventing telemetry-flood DoS.
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many telemetry events, slow down.' },
});

function trimStr(value, max) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, max);
}

function sanitiseBreadcrumbs(crumbs) {
  if (!Array.isArray(crumbs)) return null;
  return crumbs.slice(-MAX_BREADCRUMBS).map((c) => {
    if (!c || typeof c !== 'object') return null;
    return {
      t: typeof c.t === 'number' ? c.t : Date.now(),
      kind: trimStr(c.kind, 32),
      data: trimStr(typeof c.data === 'string' ? c.data : JSON.stringify(c.data || ''), 500),
    };
  }).filter(Boolean);
}

function normaliseEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const message = trimStr(raw.message, MAX_MESSAGE_LEN);
  const stack = trimStr(raw.stack, MAX_STACK_LEN);
  if (!message && !stack) return null;
  const severity = ALLOWED_SEVERITIES.has(raw.severity) ? raw.severity : 'error';
  const fingerprint = fingerprintError({ message, stack });
  return {
    fingerprint,
    type: trimStr(raw.type, 64) || 'unknown',
    severity,
    message,
    stack,
    componentStack: trimStr(raw.componentStack, MAX_COMPONENT_STACK_LEN),
    route: trimStr(raw.route, MAX_ROUTE_LEN),
    releaseSha: trimStr(raw.releaseSha, 64),
    userAgent: trimStr(raw.userAgent, 500),
    breadcrumbs: sanitiseBreadcrumbs(raw.breadcrumbs),
    sessionId: trimStr(raw.sessionId, 64),
  };
}

/**
 * POST /api/telemetry/errors
 *
 * Accepts a single event `{message, stack, ...}` or a batch `{events: [...]}`.
 * Auth-optional: req.user (set by verifyJWT) is read if upstream middleware
 * happened to populate it, but the route itself never requires a token.
 *
 * Response is intentionally minimal: { ok: true, accepted: <n> }.  Clients use
 * this only to know whether to keep retrying.
 */
router.post(
  '/errors',
  telemetryLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const rawEvents = Array.isArray(body.events)
      ? body.events.slice(0, MAX_BATCH_SIZE)
      : [body];

    const events = rawEvents.map(normaliseEvent).filter(Boolean);
    if (events.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid events' });
    }

    const userId = req.user?.id ? String(req.user.id) : null;
    const now = new Date();

    let accepted = 0;
    for (const event of events) {
      const update = {
        $setOnInsert: {
          fingerprint: event.fingerprint,
          firstSeen: now,
          status: 'open',
        },
        $set: {
          type: event.type,
          severity: event.severity,
          message: event.message,
          stack: event.stack,
          componentStack: event.componentStack,
          route: event.route,
          releaseSha: event.releaseSha,
          userAgent: event.userAgent,
          breadcrumbs: event.breadcrumbs,
          lastSeen: now,
          // Refresh TTL window each time the error recurs.
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        $inc: { count: 1 },
      };
      const addToSet = {};
      if (userId) addToSet.affectedUsers = userId;
      if (event.sessionId) addToSet.affectedSessions = event.sessionId;
      if (Object.keys(addToSet).length > 0) {
        update.$addToSet = addToSet;
      }
      try {
        const doc = await ErrorEvent.findOneAndUpdate(
          { fingerprint: event.fingerprint },
          update,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        // Auto-flag as recurring after a soft threshold within 24h.
        if (doc && doc.count >= 5 && !doc.recurring) {
          await ErrorEvent.updateOne(
            { _id: doc._id },
            { $set: { recurring: true } }
          ).catch(() => {});
        }

        accepted += 1;
        // Fire alert side-effect; never let it block the response.
        alertOnErrorEvent(doc).catch(() => {});
      } catch (err) {
        // Duplicate-key races on first insert can happen when two requests
        // land at once for a brand-new fingerprint — retry once with $inc.
        if (err && err.code === 11000) {
          try {
            await ErrorEvent.updateOne(
              { fingerprint: event.fingerprint },
              { $inc: { count: 1 }, $set: { lastSeen: now } }
            );
            accepted += 1;
          } catch {
            // give up on this event, continue with batch
          }
        }
      }
    }

    return res.json({ ok: true, accepted });
  })
);

export default router;
