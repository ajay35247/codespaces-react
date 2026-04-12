import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const plans = [
  { id: 'basic', name: 'Starter', price: 999, benefits: ['Up to 50 loads/month', 'GST-ready invoices', 'Driver tracking'] },
  { id: 'growth', name: 'Growth', price: 2499, benefits: ['Up to 200 loads/month', 'Priority support', 'Broker dashboard'] },
  { id: 'enterprise', name: 'Enterprise', price: 4999, benefits: ['Unlimited loads', 'Dedicated account manager', 'Fleet analytics'] },
];

export function Payment() {
  const [status, setStatus] = useState(null);
  const [searchParams] = useSearchParams();
  const paymentStatus = searchParams.get('status');

  useEffect(() => {
    document.title = 'Payments | Speedy Trucks';
    if (paymentStatus === 'success') {
      setStatus('success');
    } else if (paymentStatus === 'cancel') {
      setStatus('cancel');
    }
  }, [paymentStatus]);

  const handlePayment = async (planId) => {
    setStatus('processing');
    try {
      const response = await fetch(`${API_URL}/api/payments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, currency: 'INR' }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error || 'Payment gateway error');
      }
      setStatus('redirect');
      window.location.href = data.url;
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Payments</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Indian payments and subscriptions</h1>
        <p className="mt-3 text-slate-300">Choose a plan and complete the onboarding process for your logistics operations.</p>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-3xl border border-white/10 bg-slate-900 p-6">
              <h2 className="text-2xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-2 text-slate-400">₹{plan.price}/month</p>
              <ul className="mt-4 space-y-2 text-slate-300">
                {plan.benefits.map((benefit) => (
                  <li key={benefit}>• {benefit}</li>
                ))}
              </ul>
              <button
                onClick={() => handlePayment(plan.id)}
                className="mt-6 w-full rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-orange-400"
              >
                Subscribe
              </button>
            </div>
          ))}
        </div>

        {status === 'success' && <p className="mt-6 text-green-300">Payment success! Your subscription is active.</p>}
        {status === 'cancel' && <p className="mt-6 text-orange-300">Checkout canceled. You can retry a plan above.</p>}
        {status === 'redirect' && <p className="mt-6 text-sky-300">Redirecting to the checkout page...</p>}
        {status === 'error' && <p className="mt-6 text-orange-300">Payment failed. Please try again later.</p>}
      </div>
    </main>
  );
}
