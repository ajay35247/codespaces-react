import UsageCounter from '../../schemas/UsageCounterSchema.js';
import User from '../../schemas/UserSchema.js';
import Payment from '../../schemas/PaymentSchema.js';
import {
  PLAN_FEATURES,
  getActiveSubscription,
  resolvePlanCode,
} from '../../middleware/subscription.js';
import { istDateKey } from '../../middleware/quotas.js';

/**
 * Rule-based upgrade-propensity scoring.
 *
 * The output is a 0..100 score (higher = more likely to convert if nudged)
 * plus a `reasons` array the admin UI can render so the score is
 * explainable. The implementation is deliberately rule-based so it works
 * without any training data; the function is shaped so a future ML model
 * can replace the body without changing callers.
 *
 * Inputs (all best-effort — missing data simply lowers the contributing
 * signal to 0):
 *   1. peakUsageRatio  : max(usage/limit) across loads & bids today.
 *   2. recentDaysHitting80% : count of recent IST days at >=80% usage.
 *   3. accountAgeDays  : how long they've been on the platform.
 *   4. currentPlan     : free/basic/standard/premium (plus alias normalisation).
 *
 * Weights (each contributes up to ~25):
 *   peakUsageRatio    × 35
 *   highUsageDays     × min(2.5 * days, 25)
 *   accountAgeBucket  × 10  (bucket: 0..2 → 0/5/10)
 *   planTier          × 30  (free 30, basic 20, standard 10, premium 0)
 */

const HIGH_USAGE_THRESHOLD = 0.8;
const HISTORY_WINDOW_DAYS = 14;

function dayKey(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return istDateKey(d);
}

export async function scoreUserForUpgrade(userId) {
  const reasons = [];
  if (!userId) {
    return { userId: null, score: 0, reasons: ['no-user-id'], suggestedPlan: 'premium' };
  }

  // 1. Current subscription tier — heavy weight, since premium users don't
  //    need an upgrade nudge at all.
  const sub = await getActiveSubscription(userId);
  const planCode = resolvePlanCode(sub?.planId || 'free');
  const planContrib = ({ free: 30, basic: 20, standard: 10, premium: 0 })[planCode] ?? 0;
  if (planContrib > 0) {
    reasons.push(`current plan ${planCode} (+${planContrib})`);
  }

  // Premium has no upgrade target — short-circuit with a zero score.
  if (planCode === 'premium') {
    return {
      userId: String(userId),
      score: 0,
      reasons: ['already on premium'],
      planCode,
      suggestedPlan: null,
    };
  }

  // 2. Today's peak usage ratio.
  const features = PLAN_FEATURES[planCode] || PLAN_FEATURES.free;
  const today = await UsageCounter.findOne({ userId, date: istDateKey() }).lean();
  let peakRatio = 0;
  if (today) {
    const candidates = [];
    if (Number(features.loadsPerDay) > 0) {
      candidates.push((today.loadsCreated || 0) / Number(features.loadsPerDay));
    }
    if (Number(features.bidsPerDay) > 0) {
      candidates.push((today.bidsPlaced || 0) / Number(features.bidsPerDay));
    }
    peakRatio = candidates.length ? Math.max(...candidates) : 0;
  }
  const peakContrib = Math.min(35, Math.round(peakRatio * 35));
  if (peakContrib > 0) {
    reasons.push(`today's usage ${(peakRatio * 100).toFixed(0)}% (+${peakContrib})`);
  }

  // 3. Recent days at >=80% usage (a user repeatedly hitting the wall).
  const history = await UsageCounter.find({
    userId,
    date: { $gte: dayKey(HISTORY_WINDOW_DAYS), $lte: istDateKey() },
  }).select('loadsCreated bidsPlaced').lean();
  let highDays = 0;
  for (const row of history) {
    const ratios = [];
    if (Number(features.loadsPerDay) > 0) ratios.push((row.loadsCreated || 0) / Number(features.loadsPerDay));
    if (Number(features.bidsPerDay)  > 0) ratios.push((row.bidsPlaced  || 0) / Number(features.bidsPerDay));
    if (ratios.length && Math.max(...ratios) >= HIGH_USAGE_THRESHOLD) highDays += 1;
  }
  const highDaysContrib = Math.min(25, Math.round(highDays * 2.5));
  if (highDaysContrib > 0) {
    reasons.push(`${highDays} day(s) at 80%+ usage in last ${HISTORY_WINDOW_DAYS}d (+${highDaysContrib})`);
  }

  // 4. Account age — older free users are softer leads but at least
  //    convert better than brand-new signups (low intent yet).
  const user = await User.findById(userId).select('createdAt').lean();
  let ageContrib = 0;
  if (user?.createdAt) {
    const ageDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays >= 14) ageContrib = 10;
    else if (ageDays >= 3) ageContrib = 5;
    if (ageContrib > 0) reasons.push(`${ageDays}d-old account (+${ageContrib})`);
  }

  // 5. Recent failed/cancelled paid attempts soften the score — they
  //    explicitly chose not to pay last time. We reduce by 10.
  const recentFailed = await Payment.countDocuments({
    userId,
    status: { $in: ['failed', 'pending'] },
    createdAt: { $gte: new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000) },
  });
  const failedPenalty = recentFailed > 0 ? -10 : 0;
  if (failedPenalty < 0) reasons.push(`recent failed/abandoned payment (${failedPenalty})`);

  const raw = planContrib + peakContrib + highDaysContrib + ageContrib + failedPenalty;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Suggested next plan = next tier up (cf. middleware/subscription.nextPlanUp).
  // Hardcoded order here to avoid an import cycle.
  const order = ['free', 'basic', 'standard', 'premium'];
  const idx = order.indexOf(planCode);
  const suggestedPlan = idx >= 0 ? order[Math.min(idx + 1, order.length - 1)] : 'premium';

  return {
    userId: String(userId),
    score,
    reasons,
    planCode,
    suggestedPlan,
    signals: {
      peakRatio: Number(peakRatio.toFixed(2)),
      highUsageDays: highDays,
      accountAgeContrib: ageContrib,
      recentFailedPayments: recentFailed,
    },
  };
}

/**
 * Bulk scoring used by the admin candidate list. We only score recently
 * active free / basic / standard users — premium users have nothing to
 * upgrade to and dormant accounts won't convert from a nudge.
 *
 * Default cohort: distinct userIds from UsageCounter in the last 7 days.
 * Cap at 200 by default to keep the response predictable.
 */
export async function listUpgradeCandidates({ limit = 50, sinceDays = 7 } = {}) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const sinceKey = dayKey(Math.max(1, Number(sinceDays) || 7));
  const recentUserIds = await UsageCounter.distinct('userId', {
    date: { $gte: sinceKey },
  });
  if (!recentUserIds.length) return [];
  // Score sequentially — in practice the cohort is small (a few hundred)
  // and parallel scoring would balloon DB connections. If perf becomes an
  // issue, batch via Promise.all chunks of 10.
  const scored = [];
  for (const id of recentUserIds) {
    try {
      const result = await scoreUserForUpgrade(id);
      if (result.score > 0) scored.push(result);
    } catch (err) {
      // Skip individual failures; the cohort scan must not abort.
      // eslint-disable-next-line no-console
      console.warn('scoreUserForUpgrade failed for', String(id), err.message);
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, safeLimit);
}
