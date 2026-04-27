import { Router } from 'express';
import mongoose from 'mongoose';
import os from 'os';
import ErrorEvent from '../schemas/ErrorEventSchema.js';
import HealingRule from '../schemas/HealingRuleSchema.js';
import AuditLog from '../schemas/AuditLogSchema.js';
import { verifyJWT, requireAjayAdmin } from '../middleware/authorize.js';
import { requireAdminIpWhitelist } from '../middleware/adminSecurity.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { listBreakers } from '../utils/breaker.js';
import { getRedisClient } from '../utils/redisBus.js';
import { broadcast } from '../utils/socketBus.js';

const router = Router();

// All endpoints in this router require admin identity + IP whitelist.
// Order matches existing admin.js convention.
router.use(verifyJWT, requireAjayAdmin, requireAdminIpWhitelist);

const MAX_PAGE_SIZE = 100;

function parsePage(req) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.query.pageSize || '25', 10))
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/**
 * GET /admin/monitoring/errors
 *   ?status=open|auto_healed|resolved|silenced
 *   ?severity=fatal|error|warning|info
 *   ?route=<substring>
 *   ?fingerprint=<exact>
 *   ?recurring=1
 *   ?page=&pageSize=
 */
router.get(
  '/errors',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.severity) filter.severity = String(req.query.severity);
    if (req.query.recurring) filter.recurring = true;
    if (req.query.fingerprint) filter.fingerprint = String(req.query.fingerprint).slice(0, 128);
    if (req.query.route) {
      // Anchor the substring search and escape regex metacharacters so user
      // input cannot inject a costly pattern (ReDoS).
      const safe = String(req.query.route).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.route = { $regex: safe, $options: 'i' };
    }

    const { page, pageSize, skip } = parsePage(req);
    const [items, total] = await Promise.all([
      ErrorEvent.find(filter)
        .sort({ lastSeen: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('-stack -componentStack -breadcrumbs')
        .lean(),
      ErrorEvent.countDocuments(filter),
    ]);
    res.json({ items, total, page, pageSize });
  })
);

/** GET /admin/monitoring/errors/:fingerprint — full detail incl. stack + breadcrumbs */
router.get(
  '/errors/:fingerprint',
  asyncHandler(async (req, res) => {
    const fingerprint = String(req.params.fingerprint).slice(0, 128);
    const doc = await ErrorEvent.findOne({ fingerprint }).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ event: doc });
  })
);

/** PATCH /admin/monitoring/errors/:fingerprint — update status / notes */
router.patch(
  '/errors/:fingerprint',
  asyncHandler(async (req, res) => {
    const fingerprint = String(req.params.fingerprint).slice(0, 128);
    const allowedStatus = ['open', 'auto_healed', 'resolved', 'silenced'];
    const update = {};
    if (req.body && allowedStatus.includes(req.body.status)) {
      update.status = req.body.status;
    }
    if (req.body && typeof req.body.notes === 'string') {
      update.notes = req.body.notes.slice(0, 2000);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No allowed fields supplied' });
    }
    const doc = await ErrorEvent.findOneAndUpdate(
      { fingerprint },
      { $set: update },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });

    AuditLog.create({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'MONITORING_ERROR_UPDATE',
      resource: 'monitoring',
      resourceId: fingerprint,
      method: req.method,
      path: req.path,
      statusCode: 200,
      metadata: update,
    }).catch(() => {});

    res.json({ event: doc });
  })
);

/** GET /admin/monitoring/health — aggregated platform health */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [errors1h, errors24h, openCount] = await Promise.all([
      ErrorEvent.countDocuments({ lastSeen: { $gte: oneHourAgo } }),
      ErrorEvent.countDocuments({ lastSeen: { $gte: oneDayAgo } }),
      ErrorEvent.countDocuments({ status: 'open' }),
    ]);

    const redis = getRedisClient();
    let redisOk = false;
    if (redis?.isOpen) {
      try {
        const pong = await redis.ping();
        redisOk = pong === 'PONG';
      } catch {
        redisOk = false;
      }
    }

    const mongoState = mongoose.connection.readyState; // 1 = connected

    res.json({
      timestamp: new Date(now).toISOString(),
      uptimeSec: process.uptime(),
      memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      loadAvg1: os.loadavg()[0],
      mongo: { state: mongoState, ok: mongoState === 1 },
      redis: { ok: redisOk },
      errors: { lastHour: errors1h, last24h: errors24h, openFingerprints: openCount },
      breakers: listBreakers(),
    });
  })
);

/** GET /admin/monitoring/top — most-frequent error fingerprints (24h) */
router.get(
  '/top',
  asyncHandler(async (req, res) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const items = await ErrorEvent.find({ lastSeen: { $gte: oneDayAgo } })
      .sort({ count: -1 })
      .limit(20)
      .select('fingerprint message route severity count lastSeen status')
      .lean();
    res.json({ items });
  })
);

/** GET /admin/monitoring/healing-rules / POST / DELETE */
router.get(
  '/healing-rules',
  asyncHandler(async (req, res) => {
    const items = await HealingRule.find({}).sort({ createdAt: -1 }).lean();
    res.json({ items });
  })
);

router.post(
  '/healing-rules',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const allowedActions = ['reload_route', 'clear_cache_key', 'kill_switch_flag', 'rollback_release', 'soft_restart'];
    if (!body.name || !allowedActions.includes(body.action)) {
      return res.status(400).json({ error: 'Invalid name or action' });
    }
    const doc = await HealingRule.create({
      name: String(body.name).slice(0, 200),
      enabled: body.enabled !== false,
      fingerprintMatch: String(body.fingerprintMatch || '').slice(0, 128),
      matchPattern: String(body.matchPattern || '').slice(0, 500),
      action: body.action,
      actionParams: body.actionParams || null,
      cooldownMs: Math.max(60 * 1000, Number(body.cooldownMs) || 5 * 60 * 1000),
      createdByEmail: req.user?.email || '',
      notes: String(body.notes || '').slice(0, 1000),
    });
    AuditLog.create({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'MONITORING_HEALING_RULE_CREATE',
      resource: 'monitoring',
      resourceId: String(doc._id),
      method: req.method,
      path: req.path,
      statusCode: 201,
      metadata: { name: doc.name, action: doc.action },
    }).catch(() => {});
    res.status(201).json({ rule: doc });
  })
);

router.delete(
  '/healing-rules/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const doc = await HealingRule.findByIdAndDelete(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    AuditLog.create({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'MONITORING_HEALING_RULE_DELETE',
      resource: 'monitoring',
      resourceId: String(doc._id),
      method: req.method,
      path: req.path,
      statusCode: 200,
      metadata: { name: doc.name },
    }).catch(() => {});
    res.json({ ok: true });
  })
);

/**
 * POST /admin/monitoring/force-reload
 *
 * Bumps the global release signal so all connected clients see the new value
 * over the `admin:release` socket channel and prompt a soft reload.  Clients
 * that are not connected at the time will pick up the new value the next time
 * they read /api/health, which now echoes `releaseSignal`.
 */
let currentReleaseSignal = Date.now();
export function getCurrentReleaseSignal() {
  return currentReleaseSignal;
}

router.post(
  '/force-reload',
  asyncHandler(async (req, res) => {
    currentReleaseSignal = Date.now();
    broadcast('admin:release', { releaseSignal: currentReleaseSignal });
    AuditLog.create({
      userId: req.user?.id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'MONITORING_FORCE_RELOAD',
      resource: 'monitoring',
      resourceId: 'release',
      method: req.method,
      path: req.path,
      statusCode: 200,
      metadata: { releaseSignal: currentReleaseSignal },
    }).catch(() => {});
    res.json({ ok: true, releaseSignal: currentReleaseSignal });
  })
);

export default router;
