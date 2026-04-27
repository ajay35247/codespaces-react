import User from '../schemas/UserSchema.js';
import { notify } from './notifications.js';
import { broadcast } from '../utils/socketBus.js';
import { acquireLock } from '../utils/redisBus.js';
import { getAdminEmail } from '../utils/securityPolicy.js';

const ALERT_THROTTLE_MS = 15 * 60 * 1000;
const SEVERITY_RANK = { info: 0, warning: 1, error: 2, fatal: 3 };

let cachedAdminId = null;
let cachedAdminAt = 0;
const ADMIN_CACHE_MS = 5 * 60 * 1000;

async function getAdminUserId() {
  const now = Date.now();
  if (cachedAdminId && (now - cachedAdminAt) < ADMIN_CACHE_MS) {
    return cachedAdminId;
  }
  try {
    const adminEmail = getAdminEmail();
    if (!adminEmail) return null;
    const admin = await User.findOne({ email: adminEmail }).select('_id').lean();
    if (admin?._id) {
      cachedAdminId = String(admin._id);
      cachedAdminAt = now;
      return cachedAdminId;
    }
  } catch {
    // Database unavailable — best-effort.
  }
  return null;
}

/**
 * Send an admin alert for a captured error.  Throttled at 1 alert per
 * fingerprint per ALERT_THROTTLE_MS to avoid notification storms on a hot
 * error.  Always fires the live `admin:monitoring` socket event so the
 * dashboard's live feed reflects every event.
 */
export async function alertOnErrorEvent(errorEvent, { severityFloor = 'error' } = {}) {
  if (!errorEvent) return;
  const severity = errorEvent.severity || 'error';
  const meetsFloor = (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[severityFloor] ?? 0);

  // Always push live update to admin dashboard listeners.
  try {
    broadcast('admin:monitoring', {
      kind: 'error_event',
      fingerprint: errorEvent.fingerprint,
      severity,
      message: errorEvent.message,
      route: errorEvent.route,
      count: errorEvent.count,
      lastSeen: errorEvent.lastSeen,
      status: errorEvent.status,
    });
  } catch {
    // Never fail the originating telemetry write.
  }

  if (!meetsFloor) return;

  const lockKey = `alert:err:${errorEvent.fingerprint}`;
  const acquired = await acquireLock(lockKey, ALERT_THROTTLE_MS);
  if (!acquired) return;

  const adminId = await getAdminUserId();
  if (!adminId) return;

  try {
    await notify({
      userId: adminId,
      type: 'admin:error',
      title: `[${severity.toUpperCase()}] ${truncate(errorEvent.message || 'Error captured', 120)}`,
      body: `${errorEvent.route || 'unknown route'} • count: ${errorEvent.count}`,
      link: '/admin/monitoring',
      meta: {
        fingerprint: errorEvent.fingerprint,
        severity,
        count: errorEvent.count,
      },
    });
  } catch {
    // Notification side-effect — never bubble up.
  }

  // Optional webhook (Slack/Discord) — only the URL is read at fire time so
  // operators can rotate it without restarting the process.  We validate
  // the URL is HTTPS so a misconfigured env var can't downgrade alerts to
  // plain HTTP or a `file:` / `javascript:` scheme.
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl && isSafeWebhookUrl(webhookUrl)) {
    try {
      await postWebhook(webhookUrl, errorEvent, severity);
    } catch {
      // best-effort
    }
  }
}

function isSafeWebhookUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function postWebhook(url, errorEvent, severity) {
  const payload = {
    text: `[${severity.toUpperCase()}] ${truncate(errorEvent.message || 'Error captured', 200)}`,
    fingerprint: errorEvent.fingerprint,
    route: errorEvent.route,
    count: errorEvent.count,
    lastSeen: errorEvent.lastSeen,
  };
  // Use Node 20 native fetch.  AbortController gives us a hard timeout so a
  // hung webhook host can't pile up open sockets.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function truncate(str, n) {
  const s = String(str || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
