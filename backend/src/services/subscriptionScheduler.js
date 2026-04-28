import Payment from '../schemas/PaymentSchema.js';
import UsageCounter from '../schemas/UsageCounterSchema.js';
import Boost from '../schemas/BoostSchema.js';
import {
  PLAN_FEATURES,
  resolvePlanCode,
} from '../middleware/subscription.js';
import { istDateKey } from '../middleware/quotas.js';
import { notify } from './notifications.js';

/**
 * Subscription / usage notification scheduler.
 *
 * Runs every CHECK_INTERVAL_MS and emits at most ONE notification per
 * (user, signal, period) combination. Idempotency is enforced by querying
 * the Notification collection for an existing entry of the same type
 * before sending.
 *
 * Signals:
 *   - plan-expiry-3d   : sub.expiresAt within (now + 3d, now + 4d) and not yet
 *                        notified — soft heads-up.
 *   - plan-expiry-1d   : within (now + 1d, now + 2d) — final reminder.
 *   - usage-80pct      : today's peak ratio >= 80% on a non-premium plan.
 *   - boost-expired    : Boost.status='active' but expiresAt < now → flip.
 *
 * No new dependency: pure setInterval mirroring offersScheduler.js.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000;     // hourly — usage signals are coarse-grained
const INITIAL_DELAY_MS  = 30 * 1000;
// 30-day "month" / 365-day "year" mirror the same approximation used by
// middleware/subscription.getActiveSubscription (the system of record for
// renewal windows). Using calendar-accurate durations here would create a
// drift between the gate and the reminder ("you have 1 day left" / actually
// gated already). When the gate switches to calendar-aware windows, update
// both places together.
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const YEAR_MS  = 365 * 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['captured', 'success'];

let intervalHandle = null;

function expiryWindow(daysFromNow) {
  const lower = Date.now() + (daysFromNow * 24 * 60 * 60 * 1000);
  const upper = lower + (24 * 60 * 60 * 1000);
  return { lower: new Date(lower), upper: new Date(upper) };
}

async function notifyOncePerDay({ userId, type, title, body, link }) {
  // Notification.findOne would be the natural dedupe but it would couple
  // this service to the Notification schema's exact shape. We import
  // lazily to avoid the import cycle (services/notifications imports
  // socketBus → index.js → this scheduler).
  const NotificationModule = await import('../schemas/NotificationSchema.js');
  const Notification = NotificationModule.default;
  const dayKey = istDateKey();
  const existing = await Notification.findOne({
    userId,
    type,
    // We tag the notification's `meta.dayKey` so a fresh day is allowed to
    // re-notify even if the underlying signal persists.
    'meta.dayKey': dayKey,
  }).lean();
  if (existing) return null;
  return notify({ userId, type, title, body, link, meta: { dayKey } });
}

async function tickPlanExpiry() {
  // Active payments whose 30/365 day window ends in the next 1d or 3d.
  // We compute the window in JS rather than trusting a derived field on
  // the Payment doc.
  const candidates = await Payment.find({
    status: { $in: ACTIVE_STATUSES },
    planId: { $exists: true, $ne: null },
    // Skip payments older than 1 year — those windows are already long gone.
    createdAt: { $gte: new Date(Date.now() - YEAR_MS - 24 * 60 * 60 * 1000) },
  }).select('userId planId billingCycle createdAt').lean();

  const now = Date.now();
  const win3 = expiryWindow(3);
  const win1 = expiryWindow(1);

  for (const p of candidates) {
    const created = p.createdAt ? new Date(p.createdAt).getTime() : 0;
    if (!created) continue;
    const cycle = p.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const expires = created + (cycle === 'yearly' ? YEAR_MS : MONTH_MS);
    if (expires < now) continue;
    const planCode = resolvePlanCode(p.planId);

    if (expires >= win3.lower.getTime() && expires < win3.upper.getTime()) {
      await notifyOncePerDay({
        userId: p.userId,
        type: 'plan-expiry-3d',
        title: 'Your plan expires in 3 days',
        body: `Your ${planCode} subscription ends in 3 days. Renew now to keep earning without interruption.`,
        link: '/subscription',
      }).catch(() => null);
    }
    if (expires >= win1.lower.getTime() && expires < win1.upper.getTime()) {
      await notifyOncePerDay({
        userId: p.userId,
        type: 'plan-expiry-1d',
        title: 'Your plan expires tomorrow',
        body: `Final reminder: your ${planCode} plan ends tomorrow. Renew today to keep priority visibility.`,
        link: '/subscription',
      }).catch(() => null);
    }
  }
}

async function tickHighUsage() {
  // Users at >=80% of today's quota on free / basic / standard plans.
  // We base eligibility on the latest paid Payment row (mirrors
  // getActiveSubscription). Premium is unlimited, so they're skipped.
  const dayKey = istDateKey();
  const todays = await UsageCounter.find({ date: dayKey }).select('userId loadsCreated bidsPlaced').lean();
  if (!todays.length) return;

  // Group by user to batch the latest-payment lookup.
  const userIds = [...new Set(todays.map((r) => String(r.userId)))];
  const latestByUser = new Map();
  // .find().sort().limit() per user would be N round-trips — instead pull
  // all relevant payments in one shot, then pick the latest in JS.
  const payments = await Payment.find({
    userId: { $in: userIds },
    status: { $in: ACTIVE_STATUSES },
  }).select('userId planId billingCycle createdAt').lean();
  for (const p of payments) {
    const k = String(p.userId);
    const prev = latestByUser.get(k);
    if (!prev || new Date(p.createdAt) > new Date(prev.createdAt)) latestByUser.set(k, p);
  }

  for (const row of todays) {
    const k = String(row.userId);
    const sub = latestByUser.get(k);
    const planCode = resolvePlanCode(sub?.planId || 'free');
    if (planCode === 'premium') continue;
    const features = PLAN_FEATURES[planCode] || PLAN_FEATURES.free;
    const ratios = [];
    if (Number(features.loadsPerDay) > 0) ratios.push((row.loadsCreated || 0) / Number(features.loadsPerDay));
    if (Number(features.bidsPerDay)  > 0) ratios.push((row.bidsPlaced  || 0) / Number(features.bidsPerDay));
    if (!ratios.length) continue;
    const peak = Math.max(...ratios);
    if (peak < 0.8) continue;
    await notifyOncePerDay({
      userId: row.userId,
      type: 'usage-80pct',
      title: "You're close to today's limit",
      body: `You've used ${(peak * 100).toFixed(0)}% of today's allowance on the ${planCode} plan. Upgrade to keep earning without breaks.`,
      link: '/subscription?focus=premium',
    }).catch(() => null);
  }
}

async function tickExpireBoosts() {
  // Flip active boosts whose window has passed → 'expired'. The search
  // ranker already ignores them via expiresAt, so this is purely a
  // bookkeeping sweep that keeps admin queries cheap.
  try {
    await Boost.updateMany(
      { status: 'active', expiresAt: { $lte: new Date() } },
      { $set: { status: 'expired' } }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Boost expire sweep failed:', err.message);
  }
}

async function tick() {
  try {
    await Promise.all([
      tickPlanExpiry(),
      tickHighUsage(),
      tickExpireBoosts(),
    ]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Subscription scheduler tick failed:', err.message);
  }
}

export function startSubscriptionScheduler() {
  if (intervalHandle) return intervalHandle;
  setTimeout(tick, INITIAL_DELAY_MS).unref();
  intervalHandle = setInterval(tick, CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopSubscriptionScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// Exported for tests.
export const __test = { tickPlanExpiry, tickHighUsage, tickExpireBoosts };
