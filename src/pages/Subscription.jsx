import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

export function Subscription() {
  const [status, setStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Subscription | Speedy Trucks';
    apiRequest('/payments/subscription/me')
      .then((data) => setSubscription(data.subscription || null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updatePlan = async (action) => {
    setStatus('processing');
    setError(null);
    try {
      await apiRequest(`/payments/subscription/${action}`, { method: 'POST' });
      setStatus('success');
      // Refresh subscription data after action
      const data = await apiRequest('/payments/subscription/me');
      setSubscription(data.subscription || null);
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
        <p className="mt-3 text-slate-300">Upgrade, downgrade or cancel your subscription with transparent INR pricing and GST-ready invoices.</p>

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

        {error && <p className="mt-6 text-orange-300">{error}</p>}
        {status === 'processing' && <p className="mt-6 text-sky-300">Processing your request...</p>}
        {status === 'success' && <p className="mt-6 text-green-300">Subscription updated successfully.</p>}
        {status === 'error' && !error && <p className="mt-6 text-orange-300">Failed to update subscription. Please try again.</p>}
      </div>
    </main>
  );
}
