import { useEffect, useState } from 'react';
import { buildApiUrl } from '../utils/api';

export function Subscription() {
  const [status, setStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    document.title = 'Subscription | Speedy Trucks';
    setSubscription({ plan: 'Growth', renewal: '30 April 2026', status: 'Active', amount: 2499 });
  }, []);

  const updatePlan = async (action) => {
    setStatus('processing');
    try {
      const response = await fetch(buildApiUrl(`/payments/subscription/${action}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error('Subscription action failed');
      setStatus('success');
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Subscription</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Manage your plan</h1>
        <p className="mt-3 text-slate-300">Upgrade, downgrade or cancel your subscription with transparent INR pricing and GST-ready invoices.</p>

        <div className="mt-10 grid gap-6 rounded-3xl border border-white/10 bg-slate-900 p-6 text-slate-300 sm:grid-cols-2">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-300">Current plan</p>
            <p className="mt-3 text-3xl font-semibold text-white">{subscription?.plan || 'N/A'}</p>
            <p className="mt-2">Next renewal: {subscription?.renewal || '-'}</p>
            <p className="mt-2">Amount: ₹{subscription?.amount || '-'}</p>
            <p className="mt-2">Status: {subscription?.status || '-'}</p>
          </div>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => updatePlan('upgrade')}
              className="rounded-full bg-sky-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-sky-400"
            >
              Upgrade plan
            </button>
            <button
              onClick={() => updatePlan('downgrade')}
              className="rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400"
            >
              Downgrade plan
            </button>
            <button
              onClick={() => updatePlan('cancel')}
              className="rounded-full bg-slate-700 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-600"
            >
              Cancel subscription
            </button>
          </div>
        </div>

        {status === 'processing' && <p className="mt-6 text-sky-300">Processing your request...</p>}
        {status === 'success' && <p className="mt-6 text-green-300">Subscription updated successfully.</p>}
        {status === 'error' && <p className="mt-6 text-orange-300">Failed to update subscription. Please try again.</p>}
      </div>
    </main>
  );
}
