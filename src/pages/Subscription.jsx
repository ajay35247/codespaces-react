import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';
import { useSocket } from '../hooks/useSocket';

const PLAN_FEATURE_COPY = [
  { key: 'maxBidsPerMonth',    label: 'Bids per month',        format: (v) => (v === null || v === undefined) ? '—' : (typeof v === 'number' && (v < 0 || v > 1e6) ? 'Unlimited' : String(v)) },
  { key: 'walletWithdrawals',  label: 'Wallet withdrawals',    format: (v) => v ? 'Yes' : 'No' },
  { key: 'aiMatching',         label: 'AI load matching',      format: (v) => v ? 'Yes' : 'No' },
  { key: 'advancedAnalytics',  label: 'Advanced analytics',    format: (v) => v ? 'Yes' : 'No' },
  { key: 'prioritySupport',    label: 'Priority support',      format: (v) => v ? 'Yes' : 'No' },
];

function formatInr(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

export function Subscription() {
  const [status, setStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [features, setFeatures] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (couponToUse = appliedCoupon) => {
    try {
      const pricingPath = couponToUse
        ? `/payments/pricing?couponCode=${encodeURIComponent(couponToUse)}`
        : '/payments/pricing';
      const [subResponse, featureResponse, pricingResponse] = await Promise.all([
        apiRequest('/payments/subscription/me'),
        apiRequest('/payments/subscription/features'),
        apiRequest(pricingPath),
      ]);
      setSubscription(subResponse.subscription || null);
      setFeatures(featureResponse || null);
      setPricing(Array.isArray(pricingResponse?.plans) ? pricingResponse.plans : []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [appliedCoupon]);

  useEffect(() => {
    document.title = 'Subscription | Speedy Trucks';
    refresh();
  }, [refresh]);

  // Live refresh when admin creates / disables / expires an offer.
  useSocket('offers:changed', () => { refresh(); });

  const updatePlan = async (action) => {
    setStatus('processing');
    setError(null);
    try {
      await apiRequest(`/payments/subscription/${action}`, { method: 'POST' });
      setStatus('success');
      await refresh();
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const applyCoupon = (e) => {
    e?.preventDefault?.();
    const trimmed = coupon.trim();
    setAppliedCoupon(trimmed);
    refresh(trimmed);
  };

  const clearCoupon = () => {
    setCoupon('');
    setAppliedCoupon('');
    refresh('');
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Subscription</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Manage your plan</h1>
        <p className="mt-3 text-slate-300">
          Upgrade, downgrade or cancel your subscription with transparent INR pricing and GST-ready invoices.
          Paid plans unlock advanced features — placing bids on other users' loads, wallet withdrawals, and AI load matching.
        </p>

        {loading && (
          <div className="mt-10 animate-pulse rounded-3xl border border-white/10 bg-slate-900 p-6 h-40" />
        )}

        {!loading && (
          <div className="mt-10 grid gap-6 rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-300 sm:grid-cols-2">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Current plan</p>
              {subscription ? (
                <>
                  <p className="mt-3 text-3xl font-semibold text-white">{subscription.plan}</p>
                  <p className="mt-2">Next renewal: {subscription.renewal || 'N/A'}</p>
                  <p className="mt-2">Amount: ₹{subscription.amount?.toLocaleString('en-IN') || '0'}/month</p>
                  <p className="mt-2">
                    Status:{' '}
                    <span className={subscription.status === 'captured' || subscription.status === 'success' ? 'text-emerald-400' : 'text-orange-300'}>
                      {subscription.status === 'captured' || subscription.status === 'success' ? 'Active' : subscription.status}
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-2xl font-semibold text-slate-400">No active subscription</p>
                  <p className="mt-2 text-sm">Go to the <a href="/payment" className="text-orange-400 underline">Payments</a> page to subscribe.</p>
                </>
              )}
            </div>
            {subscription && (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => updatePlan('cancel')}
                  disabled={status === 'processing'}
                  className="rounded-full bg-slate-700 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancel subscription
                </button>
              </div>
            )}
          </div>
        )}

        {!loading && pricing.length > 0 && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Available plans</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Pricing reflects active offers in real time. Got a coupon? Apply it below to preview the discount.
                </p>
              </div>
              <form onSubmit={applyCoupon} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="COUPON CODE"
                  maxLength={50}
                  className="w-44 rounded-full border border-white/10 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-orange-400 focus:outline-none"
                />
                <button type="submit" className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-950 hover:bg-orange-400">
                  Apply
                </button>
                {appliedCoupon && (
                  <button type="button" onClick={clearCoupon} className="rounded-full bg-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-slate-600">
                    Clear
                  </button>
                )}
              </form>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pricing.map((plan) => {
                const hasOffer = plan.appliedOffer && plan.discountPercent > 0;
                return (
                  <div key={plan.id} className="relative rounded-2xl border border-white/10 bg-slate-950/70 p-5">
                    {hasOffer && (
                      <span className="absolute right-4 top-4 rounded-full bg-orange-500/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-950">
                        {plan.appliedOffer.label || `${plan.discountPercent}% OFF`}
                      </span>
                    )}
                    <p className="text-xs uppercase tracking-[0.24em] text-orange-300">{plan.title}</p>
                    <div className="mt-3 flex items-baseline gap-2">
                      {hasOffer ? (
                        <>
                          <span className="text-3xl font-semibold text-white">{formatInr(plan.finalPrice)}</span>
                          <span className="text-sm text-slate-500 line-through">{formatInr(plan.originalPrice)}</span>
                        </>
                      ) : (
                        <span className="text-3xl font-semibold text-white">{formatInr(plan.originalPrice)}</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{plan.description}</p>
                    {hasOffer && (
                      <p className="mt-3 text-xs text-emerald-400">
                        {plan.appliedOffer.type === 'coupon'
                          ? `Coupon ${plan.appliedOffer.couponCode || ''} — ${plan.discountPercent}% off`
                          : `${plan.appliedOffer.name} — ${plan.discountPercent}% off`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {appliedCoupon && pricing.every((p) => !(p.appliedOffer && p.appliedOffer.type === 'coupon')) && (
              <p className="mt-4 text-xs text-rose-300">
                Coupon "{appliedCoupon}" did not apply to any plan. It may be expired, restricted to other plans, or invalid.
              </p>
            )}
          </div>
        )}

        {!loading && features && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold text-white">Advanced feature access</h2>
            <p className="mt-1 text-sm text-slate-400">
              {features.active
                ? `Unlocked by your ${features.planId} plan.`
                : 'Subscribe to any plan to unlock these advanced features.'}
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURE_COPY.map(({ key, label, format }) => (
                <li key={key} className="flex items-center justify-between rounded-2xl bg-slate-950/50 px-4 py-3">
                  <span className="text-sm text-slate-200">{label}</span>
                  <span className="text-sm font-medium text-orange-300">
                    {format(features.features?.[key])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mt-6 text-orange-300">{error}</p>}
        {status === 'processing' && <p className="mt-6 text-sky-300">Processing your request...</p>}
        {status === 'success' && <p className="mt-6 text-green-300">Subscription updated successfully.</p>}
        {status === 'error' && !error && <p className="mt-6 text-orange-300">Failed to update subscription. Please try again.</p>}
      </div>
    </main>
  );
}
