/**
 * Lazily inject the Razorpay Checkout script.  Resolves to `true` when the
 * global `window.Razorpay` is available, `false` on network failure.  Three
 * pages already load it inline (Payment, Wallet, TollDashboard); centralising
 * here so new flows (load escrow) don't duplicate the DOM manipulation.
 */
export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
