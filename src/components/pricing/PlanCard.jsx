/**
 * PlanCard — single subscription tier card on the pricing page.
 *
 * Visual variants encode the conversion strategy:
 *   - 'best-value' (Premium / ₹299): scaled up, gradient border, glow,
 *     "🔥 BEST VALUE" ribbon, anchor "Only ~₹10/day" line. This is the
 *     decoy beneficiary — every other card is shaped to make this one
 *     feel obviously correct.
 *   - 'popular'    (Standard / ₹199): muted "Popular" pill, plus a
 *     visible ❌ list of what's missing (loss-aversion lever from
 *     the strategy spec). The pill is intentionally less prominent
 *     than the BEST VALUE ribbon so users don't anchor on it.
 *   - default      (Free / Basic): flat, no decoration.
 *
 * The component is presentational; subscribe/upgrade actions are
 * handled by the parent (pricing page).
 */
import { motion } from 'framer-motion';

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatLimit(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' && v < 0) return 'Unlimited';
  return String(v);
}

export function PlanCard({
  plan,
  billingCycle,
  isCurrent,
  isLoading,
  onSelect,
}) {
  const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const cyclePrice = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const variant = plan.highlight; // 'best-value' | 'popular' | null

  // Yearly savings = 12 × monthly − yearly. We show this only on paid
  // tiers when billing is yearly so the user sees concrete value.
  const yearlySavings =
    plan.monthlyPrice > 0 && cycle === 'yearly'
      ? Math.max(0, plan.monthlyPrice * 12 - plan.yearlyPrice)
      : 0;
  const yearlyStrike =
    plan.monthlyPrice > 0 && cycle === 'yearly'
      ? plan.monthlyPrice * 12
      : null;

  const features = plan.features || {};
  const isPaid = plan.monthlyPrice > 0;

  // Outer wrapper styling per variant. Premium scales up slightly; popular
  // gets a small lift; default stays flat.
  const outerClasses =
    variant === 'best-value'
      ? 'lg:scale-[1.06] lg:-my-2'
      : variant === 'popular'
        ? 'lg:scale-[1.00]'
        : 'lg:scale-[0.98]';

  const cardClasses =
    variant === 'best-value'
      ? 'border-transparent bg-gradient-to-br from-orange-500/20 via-slate-900 to-slate-950 ring-2 ring-orange-400 shadow-[0_0_40px_-8px_rgba(251,146,60,0.45)]'
      : variant === 'popular'
        ? 'border-slate-700 bg-slate-900'
        : 'border-white/10 bg-slate-900/70';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative ${outerClasses}`}
    >
      {variant === 'best-value' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-950 shadow-lg">
          🔥 Best Value
        </div>
      )}
      {variant === 'popular' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-200">
          Popular
        </div>
      )}

      <div
        className={`flex h-full flex-col rounded-3xl border p-6 transition ${cardClasses}`}
      >
        <p
          className={`text-xs uppercase tracking-[0.28em] ${
            variant === 'best-value' ? 'text-orange-300' : 'text-slate-400'
          }`}
        >
          {plan.title}
        </p>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`font-semibold text-white ${
              variant === 'best-value' ? 'text-5xl' : 'text-4xl'
            }`}
          >
            {formatInr(cyclePrice)}
          </span>
          {isPaid && (
            <span className="text-xs text-slate-400">
              /{cycle === 'yearly' ? 'yr' : 'mo'}
            </span>
          )}
        </div>

        {yearlyStrike != null && yearlySavings > 0 && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-slate-500 line-through">{formatInr(yearlyStrike)}</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300">
              Save {formatInr(yearlySavings)}
            </span>
          </div>
        )}

        {variant === 'best-value' && (
          <p className="mt-2 text-xs text-orange-200/80">
            Only ~₹{Math.round(plan.monthlyPrice / 30)}/day for maximum earnings
          </p>
        )}

        <p className="mt-3 text-sm text-slate-300">{plan.tagline}</p>

        <ul className="mt-5 space-y-2 text-sm text-slate-200">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-400">✓</span>
            <span>
              <strong>{formatLimit(features.loadsPerDay)}</strong> loads per day
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-emerald-400">✓</span>
            <span>
              <strong>{formatLimit(features.bidsPerDay)}</strong> bids per day
            </span>
          </li>
          {features.priorityVisibility && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span>Priority visibility — top of listings</span>
            </li>
          )}
          {features.fastMatching && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span>Fast load matching</span>
            </li>
          )}
          {features.premiumBadge && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span>Premium badge — buyer trust boost</span>
            </li>
          )}
          {features.supportSla === 'priority' && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span>Priority support (≤ 2 h response)</span>
            </li>
          )}
          {features.adsEnabled && (
            <li className="flex items-start gap-2 text-slate-400">
              <span className="mt-0.5">·</span>
              <span>Ads enabled</span>
            </li>
          )}
        </ul>

        {/* Loss-aversion list — Standard tier only. Spec calls these out
            explicitly as the lever that pushes 199 → 299. */}
        {Array.isArray(plan.losses) && plan.losses.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-rose-300/80">
            {plan.losses.map((loss) => (
              <li key={loss} className="flex items-start gap-2">
                <span className="mt-0.5">❌</span>
                <span>{loss}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={onSelect}
            disabled={isLoading || isCurrent}
            className={`w-full rounded-full px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
              variant === 'best-value'
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-400'
                : variant === 'popular'
                  ? 'bg-slate-700 text-white hover:bg-slate-600'
                  : 'border border-slate-600 text-slate-200 hover:bg-slate-800'
            }`}
          >
            {isCurrent ? 'Current plan' : isLoading ? 'Processing…' : plan.cta}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default PlanCard;
