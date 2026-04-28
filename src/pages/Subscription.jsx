/**
 * Subscription / Pricing page.
 *
 * Implements the 4-tier conversion-focused pricing UI from the design
 * spec: free / basic / standard / premium with monthly–yearly toggle,
 * Premium card highlighted (🔥 BEST VALUE, gradient border, glow), and
 * a feature comparison table below.
 *
 * Conversion levers wired in:
 *   - Decoy effect: Standard (₹199) shows a permanent ❌ list of what's
 *     missing, Premium (₹299) shows ✓ priority + badge + fast match.
 *   - Visual highlight: Premium scaled 1.06× on lg, gold ribbon.
 *   - Feature framing: CTAs are verbs ("Start Earning More"), never "Buy".
 *   - Loss aversion: ❌ list under Standard.
 *   - Price anchoring: "~₹10/day" line under Premium price.
 *   - Yearly trick: "2 months free" badge on the toggle, savings chip on
 *     each paid card when yearly is selected.
 *   - Usage trigger: handled globally by <QuotaExceededModal /> mounted
 *     in App.jsx — fires from anywhere a 429 QUOTA_EXCEEDED is returned.
 *
 * Server interactions:
 *   - GET /payments/pricing → catalogue with monthly+yearly resolved prices.
 *   - GET /payments/me/subscription → current plan + today's usage.
 *   - POST /payments/subscribe → creates a Razorpay order (planId + cycle).
 *
 * NB: Razorpay Checkout JS handoff lives in /pages/Payment.jsx; this page
 * surfaces the plan selection and routes the user there with the chosen
 * planId+cycle in query params, mirroring the existing Payment flow.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { useSocket } from '../hooks/useSocket';
import { useSubscription } from '../hooks/useSubscription';
import { BillingToggle } from '../components/pricing/BillingToggle';
import { PlanCard } from '../components/pricing/PlanCard';
import { ComparisonTable } from '../components/pricing/ComparisonTable';

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export function Subscription() {
  const navigate = useNavigate();
  const location = useLocation();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [pricing, setPricing] = useState([]);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState(null);
  const [actionPlanId, setActionPlanId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { subscription, usage, refresh: refreshSub } = useSubscription();

  const refreshPricing = useCallback(async (couponToUse = appliedCoupon) => {
    try {
      setPricingLoading(true);
      const path = couponToUse
        ? `/payments/pricing?couponCode=${encodeURIComponent(couponToUse)}`
        : '/payments/pricing';
      const data = await apiRequest(path);
      setPricing(Array.isArray(data?.plans) ? data.plans : []);
      setPricingError(null);
    } catch (err) {
      setPricingError(err.message);
    } finally {
      setPricingLoading(false);
    }
  }, [appliedCoupon]);

  useEffect(() => {
    document.title = 'Pricing | Speedy Trucks';
    refreshPricing();
  }, [refreshPricing]);

  // Live refresh when admin creates / disables / expires an offer.
  useSocket('offers:changed', () => { refreshPricing(); });

  // Deep-link `?focus=premium` (used by the QuotaExceededModal CTA) scrolls
  // the Premium card into view and pre-selects yearly so the savings chip
  // is immediately visible.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('focus') === 'premium') {
      setBillingCycle('yearly');
      // Wait a tick so cards are mounted before scrolling.
      const t = setTimeout(() => {
        const el = document.getElementById('plan-card-premium');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [location.search]);

  const applyCoupon = (e) => {
    e?.preventDefault?.();
    const trimmed = coupon.trim();
    setAppliedCoupon(trimmed);
    refreshPricing(trimmed);
  };

  const clearCoupon = () => {
    setCoupon('');
    setAppliedCoupon('');
    refreshPricing('');
  };

  const handleSelect = async (plan) => {
    setActionError(null);
    // Free tier — no payment, just show a confirmation. Free is the
    // default; if the user is already on it (or on trial / paid lower
    // tier), this is a no-op.
    if (plan.monthlyPrice === 0) {
      return;
    }
    setActionPlanId(plan.id);
    try {
      // Hand off to the existing Payment page which owns the Razorpay
      // Checkout JS bring-up. We pass plan + cycle as query params so it
      // can call /payments/subscribe with the right body.
      navigate(`/payment?planId=${plan.id}&cycle=${billingCycle}`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionPlanId(null);
    }
  };

  // Reorder cards for the "₹299 centered" layout requested in the spec.
  // We render Free, Basic, Standard, Premium left → right; on lg
  // viewports the .scale-up on Premium is centred visually because the
  // grid is 4 columns.
  const orderedPlans = useMemo(() => {
    const order = ['free', 'basic', 'standard', 'premium'];
    return order
      .map((id) => pricing.find((p) => p.id === id))
      .filter(Boolean);
  }, [pricing]);

  // Premium yearly savings, computed from the live catalogue so we don't
  // duplicate a hardcoded number that drifts when pricing is tuned.
  const premiumYearlySavings = useMemo(() => {
    const premium = pricing.find((p) => p.id === 'premium');
    if (!premium) return 0;
    return Math.max(0, (premium.monthlyPrice || 0) * 12 - (premium.yearlyPrice || 0));
  }, [pricing]);

  const usageBar = (() => {
    if (!usage || !subscription) return null;
    const planLabel = subscription.plan || subscription.planId;
    const segments = [
      { label: 'loads', used: usage.loadsCreated, limit: usage.loadsLimit },
      { label: 'bids',  used: usage.bidsPlaced,  limit: usage.bidsLimit  },
    ];
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
          Today's usage on <span className="text-orange-300">{planLabel}</span>
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {segments.map(({ label, used, limit }) => {
            const isUnlimited = typeof limit === 'number' && limit < 0;
            const pct = isUnlimited
              ? 0
              : Math.min(100, Math.round((Number(used) / Math.max(1, Number(limit))) * 100));
            return (
              <div key={label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="capitalize text-slate-300">{label}</span>
                  <span className="text-slate-400">
                    {isUnlimited ? `${used} • Unlimited` : `${used} / ${limit}`}
                  </span>
                </div>
                {!isUnlimited && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full transition-all ${
                        pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
      <div className="rounded-[2rem] bg-slate-950/90 p-6 shadow-2xl shadow-slate-900/20 sm:p-10">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-orange-300">Pricing</p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            Pick the plan that pays you back
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-300">
            One simple choice. Earn more, get loads faster, close deals quicker.
            Switch or cancel any time — yearly plans get 2 months free.
          </p>
          <div className="mt-8 flex justify-center">
            <BillingToggle value={billingCycle} onChange={setBillingCycle} />
          </div>
        </div>

        {/* Current usage (only shown when authed). */}
        {usageBar && (
          <div className="mt-8">
            {usageBar}
          </div>
        )}

        {/* Coupon input */}
        <div className="mt-8 flex justify-center">
          <form onSubmit={applyCoupon} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code"
              maxLength={50}
              className="w-44 rounded-full border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
            />
            <button type="submit" className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-orange-400">
              Apply
            </button>
            {appliedCoupon && (
              <button
                type="button"
                onClick={clearCoupon}
                className="rounded-full bg-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-600"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {/* Plan cards */}
        {pricingLoading && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-3xl bg-slate-900" />
            ))}
          </div>
        )}

        {!pricingLoading && pricingError && (
          <p className="mt-8 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-center text-sm text-rose-200">
            {pricingError}
          </p>
        )}

        {!pricingLoading && !pricingError && orderedPlans.length > 0 && (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
            {orderedPlans.map((plan) => (
              <div key={plan.id} id={`plan-card-${plan.id}`}>
                <PlanCard
                  plan={plan}
                  billingCycle={billingCycle}
                  isCurrent={subscription?.planId === plan.id}
                  isLoading={actionPlanId === plan.id}
                  onSelect={() => handleSelect(plan)}
                />
              </div>
            ))}
          </div>
        )}

        {actionError && (
          <p className="mt-6 text-center text-sm text-rose-300">{actionError}</p>
        )}

        {/* Comparison table */}
        {!pricingLoading && orderedPlans.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-4 text-center text-lg font-semibold text-white">
              Full feature comparison
            </h2>
            <ComparisonTable plans={orderedPlans} />
          </div>
        )}

        {/* Footer copy / FAQ-ish */}
        <div className="mt-12 grid gap-4 text-center text-xs text-slate-400 sm:grid-cols-3">
          <p>✓ Cancel auto-renewal any time</p>
          <p>✓ GST-ready invoices</p>
          <p>{premiumYearlySavings > 0
            ? `✓ Yearly plans save ${formatInr(premiumYearlySavings)} on Premium`
            : '✓ Switch plans any time'}</p>
        </div>
      </div>
    </main>
  );
}

export default Subscription;
