/**
 * QuotaExceededModal — fired anywhere in the app when the backend returns
 * HTTP 429 with body `{ code: 'QUOTA_EXCEEDED', action, planId }`.
 *
 * The modal listens for the global `quota:exceeded` window event that
 * `apiFetch` dispatches, so any page can opt-in by mounting this once at
 * app root. CTA primary action navigates to the pricing page with the
 * Premium card pre-anchored.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ACTION_COPY = {
  loads: { what: 'load posts', upgrade: 'unlimited posts' },
  bids:  { what: 'bids', upgrade: 'unlimited bids' },
};

export function QuotaExceededModal() {
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onEvent(e) {
      if (e?.detail) setDetail(e.detail);
    }
    window.addEventListener('quota:exceeded', onEvent);
    return () => window.removeEventListener('quota:exceeded', onEvent);
  }, []);

  if (!detail) return null;

  const copy = ACTION_COPY[detail.action] || { what: 'this action', upgrade: 'unlimited access' };
  const limit = Number(detail.limit) || 0;
  const planId = detail.planId || 'free';

  const handleUpgrade = () => {
    setDetail(null);
    navigate('/subscription?focus=premium');
  };

  const handleDismiss = () => setDetail(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quota-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-3xl border border-orange-400/30 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-6 shadow-2xl">
        <p className="text-3xl">⚠️</p>
        <h2 id="quota-modal-title" className="mt-2 text-2xl font-semibold text-white">
          Daily limit reached
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          You've used all <strong>{limit}</strong> {copy.what} on the {planId} plan
          today. Upgrade to <span className="text-orange-300 font-semibold">Premium</span>{' '}
          for {copy.upgrade} — never miss a load again.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUpgrade}
            className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-lg transition hover:from-amber-300 hover:to-orange-400"
          >
            Upgrade to Premium
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-slate-800"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuotaExceededModal;
