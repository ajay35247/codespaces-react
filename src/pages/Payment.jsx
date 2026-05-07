/**
 * Payment / Razorpay checkout handoff.
 *
 * This page is intentionally checkout-only — plan selection lives at
 * `/subscription`. The Subscription page hands users off here with
 * `?planId=<id>&cycle=<billingCycle>` query params; we then:
 *
 *   1. POST /payments/subscribe { planId, billingCycle }
 *      to create a Razorpay order on the server.
 *   2. Load the Razorpay Checkout JS and open the modal.
 *   3. POST /payments/verify with the gateway response so the backend can
 *      verify the HMAC signature and activate the subscription.
 *
 * If the page is opened without the required params (e.g. someone clicks
 * a stale "Payments" sidebar link), we redirect to `/subscription` so the
 * user can pick a plan first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest, LONG_TIMEOUT_MS } from '../utils/api';
import { useSubscription } from '../hooks/useSubscription';

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

/**
 * Normalize a payment error into a user-actionable message.
 *
 * Captures the most common mobile-WebView failure modes (missing CSRF token,
 * timeout, generic network error) and rewrites them as recovery guidance so
 * users aren't stuck at a generic "Payment failed" screen.
 */
function normalizePaymentError(error) {
  const raw = String(error?.message || error || '').trim();
  if (!raw) return 'Payment failed. Please try again.';
  const lc = raw.toLowerCase();
  if (lc.includes('csrf')) {
    return 'Security check failed. Please log out, sign back in, and retry the payment. (If you just installed/updated the app, clearing app storage may help.)';
  }
  if (lc.includes('timeout')) {
    return 'The payment server took too long to respond. Check your connection and try again in a moment.';
  }
  if (lc.includes('network') || lc.includes('failed to fetch')) {
    return 'Network error reaching the payment server. Check your connection and try again.';
  }
  if (lc.includes('service temporarily unavailable')) {
    return 'Our payment service is temporarily unavailable. Please retry in a moment.';
  }
  return raw;
}

export function Payment() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const { refresh: refreshSubscription } = useSubscription();

  const planId = searchParams.get('planId');
  const cycle = searchParams.get('cycle') || 'monthly';
  const couponCode = searchParams.get('coupon') || '';

  const [status, setStatus] = useState('idle'); // idle | processing | redirect | success | cancel | error
  const [errorMessage, setErrorMessage] = useState('');
  // Guards against React 18 StrictMode double-invoke and any accidental
  // re-runs that would otherwise create duplicate Razorpay orders.
  const startedRef = useRef(false);

  useEffect(() => {
    document.title = 'Checkout | Speedy Trucks';
  }, []);

  const startCheckout = useCallback(async () => {
    setStatus('processing');
    setErrorMessage('');
    try {
      const subscribeBody = { planId, billingCycle: cycle };
      if (couponCode) subscribeBody.couponCode = couponCode;
      const data = await apiRequest('/payments/subscribe', {
        method: 'POST',
        body: subscribeBody,
        // Razorpay Orders round-trip can exceed the default 15 s budget on
        // flaky mobile networks; give it the long budget so the user doesn't
        // see a spurious TimeoutError before Razorpay actually responds.
        timeoutMs: LONG_TIMEOUT_MS,
      });
      if (!data.orderId) throw new Error('Payment gateway error');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Unable to load Razorpay checkout');

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Speedy Trucks',
        // The plan object returned from /subscribe carries `tagline` (the
        // marketing one-liner shown on the pricing card), not `description`.
        // Use tagline when present and fall back to a generic line so the
        // Razorpay modal never shows the literal text "undefined".
        description: data.plan?.tagline || data.plan?.description || `${planId} plan (${cycle})`,
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
              // Verify performs HMAC + DB writes; on slow mobile networks the
              // post-checkout window can take >15 s. Long budget so users
              // never see a "request timed out" right after a successful
              // Razorpay charge (the worst possible UX moment to time out).
              timeoutMs: LONG_TIMEOUT_MS,
            });
            // Refresh subscription state so the header/nav reflects the new
            // plan immediately without requiring a hard page reload.
            refreshSubscription().catch((err) => {
              console.warn('Subscription refresh after payment failed:', err?.message);
            });
            setStatus('success');
          } catch (verifyError) {
            console.error('Payment verification failed:', verifyError);
            setErrorMessage(normalizePaymentError(verifyError));
            setStatus('error');
          }
        },
        modal: {
          ondismiss: () => setStatus('cancel'),
        },
        prefill: { name: user?.name || '', email: user?.email || '' },
        notes: { planId: data.plan?.id || planId, billingCycle: cycle },
        theme: { color: '#f97316' },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      setStatus('redirect');
    } catch (error) {
      console.error(error);
      setErrorMessage(normalizePaymentError(error));
      setStatus('error');
    }
  }, [planId, cycle, couponCode, user?.name, user?.email, refreshSubscription]);

  // Auto-start the checkout once on mount when params are present. If
  // params are missing, bounce the user to the pricing page where plan
  // selection actually lives.
  useEffect(() => {
    if (!planId) {
      navigate('/subscription', { replace: true });
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    startCheckout();
  }, [planId, navigate, startCheckout]);

  const retry = () => {
    startedRef.current = true; // already true, but keep explicit
    startCheckout();
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Checkout</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Complete your subscription</h1>
        {planId && (
          <p className="mt-3 text-slate-300">
            Plan <span className="font-semibold text-white">{planId}</span>
            <span className="text-slate-400"> · {cycle} billing</span>
          </p>
        )}

        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 px-5 py-6 text-sm">
          {status === 'idle' && (
            <p className="text-slate-300">Preparing checkout…</p>
          )}
          {status === 'processing' && (
            <p className="text-sky-300">Preparing checkout…</p>
          )}
          {status === 'redirect' && (
            <p className="text-sky-300">
              Razorpay checkout is open in a popup. Complete the payment to activate your subscription.
            </p>
          )}
          {status === 'success' && (
            <div>
              <p className="text-green-300">Payment success! Your subscription is active.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/subscription"
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 hover:border-orange-400/50 hover:text-orange-300"
                >
                  Back to plans
                </Link>
                <Link
                  to="/dashboard"
                  className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-orange-400"
                >
                  Go to dashboard
                </Link>
              </div>
            </div>
          )}
          {status === 'cancel' && (
            <div>
              <p className="text-orange-300">Checkout canceled. You can retry below or pick a different plan.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-orange-400"
                >
                  Retry payment
                </button>
                <Link
                  to="/subscription"
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 hover:border-orange-400/50 hover:text-orange-300"
                >
                  Choose another plan
                </Link>
              </div>
            </div>
          )}
          {status === 'error' && (
            <div>
              <p className="text-rose-300">
                Payment failed. Please try again later.
                {errorMessage && <span className="block mt-1 text-xs text-rose-200/80">{errorMessage}</span>}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 hover:bg-orange-400"
                >
                  Try again
                </button>
                <Link
                  to="/subscription"
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 hover:border-orange-400/50 hover:text-orange-300"
                >
                  Back to plans
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default Payment;
