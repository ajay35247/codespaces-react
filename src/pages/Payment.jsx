import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { apiRequest } from '../utils/api';

// ── Plan categories ─────────────────────────────────────────────────────────
const PLAN_CATEGORIES = [
  {
    id: 'basic',
    categoryKey: 'starter',
    label: 'Starter',
    monthlyPrice: 999,
    benefits: ['Up to 50 loads/month', 'GST-ready invoices', 'Driver tracking'],
    accentColor: 'text-sky-400',
    accentBorder: 'border-sky-500/50',
  },
  {
    id: 'growth',
    categoryKey: 'growth',
    label: 'Growth',
    monthlyPrice: 2499,
    benefits: ['Up to 200 loads/month', 'Priority support', 'Broker dashboard'],
    accentColor: 'text-orange-400',
    accentBorder: 'border-orange-500/50',
  },
  {
    id: 'enterprise',
    categoryKey: 'enterprise',
    label: 'Enterprise',
    monthlyPrice: 4999,
    benefits: ['Unlimited loads', 'Dedicated account manager', 'Fleet analytics'],
    accentColor: 'text-violet-400',
    accentBorder: 'border-violet-500/50',
  },
];

// ── Billing cycles ───────────────────────────────────────────────────────────
// multiplier is relative to the monthly price; special cycles have no direct
// charge (trial = free introductory period; free = ₹0 plan).
const BILLING_CYCLES = [
  { key: 'daily',      label: 'Daily',         suffix: '/day',       multiplier: 1 / 30 },
  { key: 'weekly',     label: 'Weekly',        suffix: '/week',      multiplier: 1 / 4  },
  { key: 'fifteenDay', label: '15-day',        suffix: '/15 days',   multiplier: 1 / 2  },
  { key: 'monthly',    label: 'Monthly',       suffix: '/month',     multiplier: 1      },
  { key: 'quarterly',  label: 'Quarterly',     suffix: '/quarter',   multiplier: 2.7    }, // 3 months at 10% bulk discount (3 × 0.90)
  { key: 'halfYearly', label: '6-month',       suffix: '/6 months',  multiplier: 5.1    }, // 6 months at 15% bulk discount (6 × 0.85)
  { key: 'yearly',     label: '1-year',        suffix: '/year',      multiplier: 9.6    }, // 12 months at 20% bulk discount (12 × 0.80)
  { key: '_trial',     label: '15-day Trial',  suffix: ' free',      multiplier: 0, special: 'trial' },
  { key: '_free',      label: 'Free',          suffix: '',           multiplier: 0, special: 'free'  },
];

function computePrice(monthlyPrice, cycle) {
  if (cycle.special) return 0;
  return Math.ceil(monthlyPrice * cycle.multiplier);
}

function formatInr(amount) {
  if (amount === 0) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function Payment() {
  const [status, setStatus] = useState(null);
  // Plan category tab (which plan is actively selected / highlighted)
  const [activeCategory, setActiveCategory] = useState('starter');
  // Billing cycle tab (which duration to price)
  const [activeCycle, setActiveCycle] = useState('monthly');
  // Trial state from backend: { state: 'never'|'active'|'expired'|null, daysLeft, endsAt, totalDays }
  const [trial, setTrial] = useState(null);
  const [trialBusy, setTrialBusy] = useState(false);
  const user = useSelector((state) => state.auth.user);

  useEffect(() => {
    document.title = 'Payments | Speedy Trucks';
  }, []);

  // Fetch the user's trial status on mount so the banner reflects reality.
  // Failure is non-fatal: the banner falls back to the "start trial" CTA.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest('/payments/trial/status');
        if (!cancelled) setTrial(data);
      } catch {
        if (!cancelled) setTrial({ state: 'never', daysLeft: 0, totalDays: 15 });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleStartTrial = async () => {
    setTrialBusy(true);
    try {
      const data = await apiRequest('/payments/trial/start', { method: 'POST', body: {} });
      setTrial({ ...data, state: 'active' });
      setStatus('success');
    } catch (error) {
      console.error('Trial start failed:', error);
      setStatus('error');
    } finally {
      setTrialBusy(false);
    }
  };

  const selectedCycle = BILLING_CYCLES.find((c) => c.key === activeCycle) || BILLING_CYCLES[3];

  const handlePayment = async (planId) => {
    if (selectedCycle.special === 'trial') {
      // Trial uses the dedicated /payments/trial/start endpoint — there is
      // a single 15-day trial per user regardless of which plan card they
      // click, so planId is informational only.
      await handleStartTrial();
      return;
    }
    if (selectedCycle.special === 'free') {
      setStatus('processing');
      try {
        await apiRequest('/payments/subscribe', {
          method: 'POST',
          body: { planId, currency: 'INR', billingCycle: activeCycle },
        });
        setStatus('success');
      } catch (error) {
        console.error(error);
        setStatus('error');
      }
      return;
    }

    setStatus('processing');
    try {
      const data = await apiRequest('/payments/subscribe', {
        method: 'POST',
        body: { planId, currency: 'INR', billingCycle: activeCycle },
      });
      if (!data.orderId) throw new Error('Payment gateway error');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Unable to load Razorpay checkout');

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Speedy Trucks',
        description: data.plan.description,
        order_id: data.orderId,
        handler: async function (response) {
          if (!response.razorpay_payment_id) { setStatus('error'); return; }
          try {
            await apiRequest('/payments/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            });
            setStatus('success');
          } catch (verifyError) {
            console.error('Payment verification failed:', verifyError);
            setStatus('error');
          }
        },
        prefill: { name: user?.name || '', email: user?.email || '' },
        notes: { planId: data.plan.id, billingCycle: activeCycle },
        theme: { color: '#f97316' },
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

        {/* ── Global 15-day trial banner (visible to every user) ─────────── */}
        <TrialBanner trial={trial} busy={trialBusy} onStart={handleStartTrial} />

        {/* ── Plan category tabs ─────────────────────────────────────────── */}
        <div className="mt-10 flex flex-wrap gap-2">
          {PLAN_CATEGORIES.map((cat) => (
            <button
              key={cat.categoryKey}
              type="button"
              onClick={() => setActiveCategory(cat.categoryKey)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                activeCategory === cat.categoryKey
                  ? 'bg-orange-500 text-slate-950'
                  : 'border border-white/15 text-slate-300 hover:border-orange-400/50 hover:text-orange-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* ── Billing cycle tabs ─────────────────────────────────────────── */}
        <div className="mt-5 flex flex-wrap gap-2">
          {BILLING_CYCLES.map((cycle) => (
            <button
              key={cycle.key}
              type="button"
              onClick={() => setActiveCycle(cycle.key)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                activeCycle === cycle.key
                  ? cycle.special === 'trial'
                    ? 'bg-sky-500 text-slate-950'
                    : cycle.special === 'free'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-orange-500 text-slate-950'
                  : 'border border-white/15 text-slate-400 hover:border-orange-400/50 hover:text-orange-300'
              }`}
            >
              {cycle.label}
            </button>
          ))}
        </div>

        {/* ── Trial / Free notice ────────────────────────────────────────── */}
        {selectedCycle.special === 'trial' && (
          <div className="mt-5 rounded-2xl border border-sky-500/30 bg-sky-600/10 px-4 py-3 text-sm text-sky-200">
            🎁 <strong>15-day free trial</strong> — try any plan free for 15 days. No charge until the trial ends.
          </div>
        )}
        {selectedCycle.special === 'free' && (
          <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-200">
            ✓ <strong>Free plan</strong> — limited features, no payment required.
          </div>
        )}

        {/* ── Plan cards ────────────────────────────────────────────────── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {PLAN_CATEGORIES.map((plan) => {
            const isActive = plan.categoryKey === activeCategory;
            const price = computePrice(plan.monthlyPrice, selectedCycle);

            return (
              <div
                key={plan.id}
                onClick={() => setActiveCategory(plan.categoryKey)}
                className={`cursor-pointer rounded-3xl border p-6 transition-all ${
                  isActive
                    ? `${plan.accentBorder} bg-slate-900 shadow-lg`
                    : 'border-white/10 bg-slate-900/50 opacity-75 hover:opacity-100'
                }`}
              >
                <h2 className={`text-2xl font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                  {plan.label}
                </h2>

                {/* Price display for selected cycle */}
                <div className="mt-3 flex items-baseline gap-1">
                  {selectedCycle.special ? (
                    <span className={`text-3xl font-bold ${
                      selectedCycle.special === 'trial' ? 'text-sky-400' : 'text-emerald-400'
                    }`}>
                      {selectedCycle.special === 'trial' ? '15 days free' : 'Free'}
                    </span>
                  ) : (
                    <>
                      <span className={`text-3xl font-bold ${plan.accentColor}`}>{formatInr(price)}</span>
                      <span className="text-sm text-slate-400">{selectedCycle.suffix}</span>
                    </>
                  )}
                </div>

                {/* Monthly equivalent for non-monthly cycles */}
                {!selectedCycle.special && activeCycle !== 'monthly' && (
                  <p className="mt-1 text-xs text-slate-500">
                    ≈ {formatInr(plan.monthlyPrice)}/month equivalent
                  </p>
                )}

                <ul className="mt-4 space-y-2 text-slate-300">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 ${plan.accentColor}`}>•</span>
                      {benefit}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={(e) => {
                  e.stopPropagation();
                  handlePayment(plan.id);
                }}
                  disabled={status === 'processing'}
                  className={`mt-6 w-full rounded-full px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] transition disabled:opacity-50 ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 hover:bg-orange-400'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  {selectedCycle.special === 'trial' ? 'Start Free Trial' : selectedCycle.special === 'free' ? 'Get Free' : 'Subscribe'}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Status messages ───────────────────────────────────────────── */}
        {status === 'processing' && <p className="mt-6 text-sky-300">Preparing checkout...</p>}
        {status === 'success'    && <p className="mt-6 text-green-300">Payment success! Your subscription is active.</p>}
        {status === 'cancel'     && <p className="mt-6 text-orange-300">Checkout canceled. You can retry a plan above.</p>}
        {status === 'redirect'   && <p className="mt-6 text-sky-300">Redirecting to the checkout page...</p>}
        {status === 'error'      && <p className="mt-6 text-orange-300">Payment failed. Please try again later.</p>}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TrialBanner — prominent always-visible banner showing the user's 15-day
// free trial state. Three variants:
//   never   → "Start your 15-day free trial" CTA
//   active  → "N days left" countdown badge
//   expired → "Trial expired — subscribe to keep features" warning
// ─────────────────────────────────────────────────────────────────────────────
function TrialBanner({ trial, busy, onStart }) {
  // Until the status fetch settles we render a neutral placeholder so the
  // page layout doesn't jump.
  if (!trial) {
    return (
      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-4 text-sm text-slate-400">
        Loading your trial status…
      </div>
    );
  }

  if (trial.state === 'active') {
    const daysLeft = Number(trial.daysLeft || 0);
    const endsAtText = trial.endsAt
      ? new Date(trial.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—';
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/40 bg-sky-600/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-300">
            🎁 Trial Active
          </span>
          <p className="text-sm text-sky-100">
            <strong>{daysLeft}</strong> day{daysLeft === 1 ? '' : 's'} left in your free trial
            <span className="ml-1 text-sky-300">· ends {endsAtText}</span>
          </p>
        </div>
        <p className="text-xs text-sky-300/80">
          Subscribe before your trial ends to keep advanced features.
        </p>
      </div>
    );
  }

  if (trial.state === 'expired') {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/50 bg-rose-600/15 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-rose-500/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-rose-200">
            ⏱ Trial Expired
          </span>
          <p className="text-sm text-rose-100">
            Your 15-day free trial has ended. Subscribe to a plan below to continue using advanced features.
          </p>
        </div>
      </div>
    );
  }

  // state === 'never'
  const totalDays = Number(trial.totalDays || 15);
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-600/10 px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300">
          ✨ Free for {totalDays} days
        </span>
        <p className="text-sm text-emerald-100">
          Get full access to advanced features for <strong>{totalDays} days</strong> — no credit card required.
        </p>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="rounded-full bg-emerald-500 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? 'Starting…' : 'Start Free Trial'}
      </button>
    </div>
  );
}
