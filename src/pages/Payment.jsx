import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const plans = [
  { id: 'basic', name: 'Starter', price: 999, benefits: ['Up to 50 loads/month', 'GST-ready invoices', 'Driver tracking'] },
  { id: 'growth', name: 'Growth', price: 2499, benefits: ['Up to 200 loads/month', 'Priority support', 'Broker dashboard'] },
  { id: 'enterprise', name: 'Enterprise', price: 4999, benefits: ['Unlimited loads', 'Dedicated account manager', 'Fleet analytics'] },
];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      return resolve(true);
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function Payment() {
  const [status, setStatus] = useState(null);
  const user = useSelector((state) => state.auth.user);

  useEffect(() => {
    document.title = 'Payments | Speedy Trucks';
  }, []);

  const handlePayment = async (planId) => {
    setStatus('processing');
    try {
      const response = await fetch(`${API_URL}/api/payments/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, currency: 'INR' }),
      });
      const data = await response.json();
      if (!response.ok || !data.orderId) {
        throw new Error(data.error || 'Payment gateway error');
      }

      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Unable to load Razorpay checkout');
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Speedy Trucks',
        description: data.plan.description,
        order_id: data.orderId,
        handler: function (response) {
          if (response.razorpay_payment_id) {
            setStatus('success');
          } else {
            setStatus('error');
          }
        },
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
        },
        notes: {
          planId: data.plan.id,
        },
        theme: {
          color: '#0B3D91',
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      setStatus('redirect');
    } catch (error) {
      console.error(error);
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

        {status === 'processing' && <p className="mt-6 text-sky-300">Preparing checkout...</p>}
        {status === 'success' && <p className="mt-6 text-green-300">Payment success! Your subscription is active.</p>}
        {status === 'cancel' && <p className="mt-6 text-orange-300">Checkout canceled. You can retry a plan above.</p>}
        {status === 'redirect' && <p className="mt-6 text-sky-300">Redirecting to the checkout page...</p>}
        {status === 'error' && <p className="mt-6 text-orange-300">Payment failed. Please try again later.</p>}
      </div>
    </main>
  );
}
