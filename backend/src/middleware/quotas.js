import UsageCounter from '../schemas/UsageCounterSchema.js';
import { getActiveSubscription } from './subscription.js';

/**
 * Daily-quota enforcement.
 *
 * Each user has a per-tier daily allowance for the actions we care about
 * (currently: 'loads' = creating a load post; 'bids' = placing a bid).
 * The allowance comes from `sub.features[<action>PerDay]`; a value of -1
 * means unlimited. When the counter for today >= allowance, we respond
 * with HTTP 429 + JSON body `{ code: 'QUOTA_EXCEEDED', ... }` so the
 * frontend can pop the upgrade modal.
 *
 * Day boundaries are computed in Asia/Kolkata. Counters are atomic via
 * findOneAndUpdate({ $inc }, { upsert: true }) — no read-modify-write
 * race. The unique compound index (userId, date) on UsageCounter
 * guarantees one row per user-day.
 *
 * Rollout safety: if `process.env.QUOTA_ENFORCEMENT` is not the literal
 * string 'enforce', the middleware logs the over-quota event and lets
 * the request through. This lets us deploy + observe before flipping the
 * switch in production.
 */

const ACTION_TO_FEATURE_KEY = Object.freeze({
  loads: 'loadsPerDay',
  bids:  'bidsPerDay',
});
const ACTION_TO_COUNTER_KEY = Object.freeze({
  loads: 'loadsCreated',
  bids:  'bidsPlaced',
});

/**
 * Returns 'YYYY-MM-DD' for "today" in Asia/Kolkata. Uses the Intl
 * formatter so we don't need to bundle a tz library — V8's ICU data has
 * IST built-in. Format is `en-CA` because it produces ISO-like
 * `YYYY-MM-DD` directly.
 */
export function istDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Looks up today's counter without incrementing. Used by
 * `/payments/me/subscription` to render the "3/10 loads today" usage bar.
 */
export async function readUsage(userId, dateKey = istDateKey()) {
  if (!userId) return { date: dateKey, loadsCreated: 0, bidsPlaced: 0 };
  const row = await UsageCounter.findOne({ userId, date: dateKey }).lean();
  return {
    date: dateKey,
    loadsCreated: row?.loadsCreated || 0,
    bidsPlaced:   row?.bidsPlaced || 0,
  };
}

export function requireDailyQuota(action) {
  const featureKey = ACTION_TO_FEATURE_KEY[action];
  const counterKey = ACTION_TO_COUNTER_KEY[action];
  if (!featureKey || !counterKey) {
    throw new Error(`requireDailyQuota: unknown action '${action}'`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sub = await getActiveSubscription(req.user.id);
      // sub is guaranteed non-null after the synthetic-free refactor, but
      // we still guard defensively.
      const limit = Number(sub?.features?.[featureKey]);
      const planId = sub?.planId || 'free';

      // limit < 0 (-1 sentinel) means unlimited — Premium tier.
      if (Number.isFinite(limit) && limit >= 0) {
        const dateKey = istDateKey();
        const current = await readUsage(req.user.id, dateKey);
        const used = current[counterKey] || 0;

        if (used >= limit) {
          const enforce = process.env.QUOTA_ENFORCEMENT === 'enforce';
          // Always log so admins can see the conversion signal even when
          // not enforcing.
          console.warn('quota.exceeded', {
            userId: String(req.user.id),
            action,
            planId,
            limit,
            used,
            enforce,
          });
          if (enforce) {
            return res.status(429).json({
              error: 'Daily limit reached for your current plan',
              code: 'QUOTA_EXCEEDED',
              action,
              limit,
              used,
              planId,
              upgradeTo: planId === 'premium' ? null : 'premium',
            });
          }
        }
      }

      // Increment the counter atomically. Even when not enforcing we keep
      // the counter so that "soak mode" telemetry shows real usage volume.
      try {
        await UsageCounter.findOneAndUpdate(
          { userId: req.user.id, date: istDateKey() },
          { $inc: { [counterKey]: 1 } },
          { upsert: true, new: true }
        );
      } catch (err) {
        // Counter writes must never block the action — log and proceed.
        console.warn('quota.counter-write-failed', { action, error: err.message });
      }

      return next();
    } catch (error) {
      console.error('Quota middleware error:', error.message);
      // Fail open: we never want a transient counter error to block
      // legitimate user activity. The action itself is otherwise valid.
      return next();
    }
  };
}

export const __test = { ACTION_TO_FEATURE_KEY, ACTION_TO_COUNTER_KEY };
