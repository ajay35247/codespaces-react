import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

const PLAN_FEATURE_COPY = [
  { key: 'maxBidsPerMonth',    label: 'Bids per month',        format: (v) => (v === null || v === undefined) ? '—' : (v === Infinity || v > 1e6 ? 'Unlimited' : String(v)) },
  { key: 'walletWithdrawals',  label: 'Wallet withdrawals',    format: (v) => v ? 'Yes' : 'No' },
  { key: 'aiMatching',         label: 'AI load matching',      format: (v) => v ? 'Yes' : 'No' },
  { key: 'advancedAnalytics',  label: 'Advanced analytics',    format: (v) => v ? 'Yes' : 'No' },
  { key: 'prioritySupport',    label: 'Priority support',      format: (v) => v ? 'Yes' : 'No' },
];

export function Subscription() {
  const [status, setStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    try {
      const [subResponse, featureResponse] = await Promise.all([
        apiRequest('/payments/subscription/me'),
        apiRequest('/payments/subscription/features'),
      ]);
      setSubscription(subResponse.subscription || null);
      setFeatures(featureResponse || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = 'Subscription | Speedy Trucks';
    refresh();
  }, []);

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
