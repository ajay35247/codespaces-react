import Queue from 'bull';
import ErrorEvent from '../schemas/ErrorEventSchema.js';
import HealingRule from '../schemas/HealingRuleSchema.js';
import { broadcast } from '../utils/socketBus.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Healing queue — runs auto-heal jobs:
 *   - apply-healing-rule:   apply a HealingRule to a fingerprint (admin-driven
 *                           or auto-promoted from threshold breach)
 *   - prune-stale-errors:   mark long-untouched 'open' fingerprints as resolved
 *
 * Bull is already a project dependency.  All jobs are best-effort and never
 * crash the worker; failures are logged and bounded by the default retry
 * config (3 attempts, exponential).
 */
export const healingQueue = new Queue('healing-queue', redisUrl);

const queueOptions = {
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
};

healingQueue.on('error', (err) => {
  // Likely Redis is down — keep the parent process alive.
  // eslint-disable-next-line no-console
  console.warn('[healing] queue error:', err.message);
});

async function applyAction(rule, errorEvent) {
  switch (rule.action) {
    case 'reload_route': {
      const route = (rule.actionParams && rule.actionParams.route) || errorEvent.route || '/';
      broadcast('admin:heal', { kind: 'reload_route', route, fingerprint: errorEvent.fingerprint });
      return { applied: true, kind: 'reload_route', route };
    }
    case 'clear_cache_key': {
      const key = rule.actionParams?.key || '';
      broadcast('admin:heal', { kind: 'clear_cache_key', key, fingerprint: errorEvent.fingerprint });
      return { applied: true, kind: 'clear_cache_key', key };
    }
    case 'soft_restart': {
      broadcast('admin:heal', { kind: 'soft_restart', fingerprint: errorEvent.fingerprint });
      return { applied: true, kind: 'soft_restart' };
    }
    case 'kill_switch_flag': {
      // Advisory only — direct AdminControlState writes require an admin
      // user id (schema-required `updatedBy`).  We broadcast intent so the
      // admin dashboard can prompt the operator to apply the flag through
      // the proper /admin/control/kill-switch endpoint (which writes audit
      // metadata).
      const flag = rule.actionParams?.flag;
      const value = !!rule.actionParams?.value;
      if (!flag) return { applied: false, reason: 'missing flag' };
      broadcast('admin:heal', { kind: 'kill_switch_flag_suggested', flag, value, fingerprint: errorEvent.fingerprint });
      return { applied: true, kind: 'kill_switch_flag_suggested', flag, value };
    }
    case 'rollback_release': {
      // Rollback is delegated to the deploy platform's redeploy webhook.
      const url = process.env.ROLLBACK_WEBHOOK_URL;
      if (!url) return { applied: false, reason: 'ROLLBACK_WEBHOOK_URL not set' };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(url, { method: 'POST', signal: controller.signal });
        return { applied: true, kind: 'rollback_release' };
      } catch (err) {
        return { applied: false, reason: err.message };
      } finally {
        clearTimeout(timeout);
      }
    }
    default:
      return { applied: false, reason: 'unknown action' };
  }
}

healingQueue.process('apply-healing-rule', async (job) => {
  const { ruleId, fingerprint } = job.data || {};
  const rule = await HealingRule.findById(ruleId);
  const errorEvent = await ErrorEvent.findOne({ fingerprint }).lean();
  if (!rule || !errorEvent || !rule.enabled) {
    return { skipped: true };
  }
  const now = Date.now();
  if (rule.lastAppliedAt && (now - new Date(rule.lastAppliedAt).getTime()) < rule.cooldownMs) {
    return { skipped: true, reason: 'cooldown' };
  }
  const result = await applyAction(rule, errorEvent);
  if (result.applied) {
    await HealingRule.updateOne(
      { _id: rule._id },
      { $set: { lastAppliedAt: new Date() }, $inc: { appliedCount: 1 } }
    );
    await ErrorEvent.updateOne(
      { _id: errorEvent._id },
      { $set: { status: 'auto_healed' }, $inc: { autoHealAttempts: 1 } }
    );
  }
  return result;
});

healingQueue.process('prune-stale-errors', async () => {
  // Mark `open` events untouched for 7 days as resolved so the dashboard's
  // open-count doesn't grow unboundedly.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await ErrorEvent.updateMany(
    { status: 'open', lastSeen: { $lt: cutoff } },
    { $set: { status: 'resolved' } }
  );
  return { modified: result.modifiedCount || 0 };
});

/**
 * Wire up periodic jobs.  Called once from index.js after Redis is connected.
 * Idempotent — a second call replaces any existing repeatable job.
 */
export async function startHealingScheduler() {
  try {
    await healingQueue.add('prune-stale-errors', {}, {
      ...queueOptions,
      repeat: { every: 60 * 60 * 1000 }, // hourly
      jobId: 'prune-stale-errors-recurring',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[healing] could not schedule prune job:', err.message);
  }
}

export async function enqueueApplyRule(ruleId, fingerprint) {
  return healingQueue.add('apply-healing-rule', { ruleId, fingerprint }, queueOptions);
}
