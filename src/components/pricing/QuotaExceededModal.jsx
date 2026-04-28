/**
 * QuotaExceededModal — fired anywhere in the app when the backend signals
 * an upgrade is needed. Two event channels feed it:
 *
 *   1. `quota:exceeded` — legacy 429 QUOTA_EXCEEDED payload
 *      `{ code, action, planId, limit, used }`.
 *   2. `upgrade:required` — standardised 402/429 hint
 *      `{ upgrade, trigger, fromPlan, suggestedPlan, message, meta }`
 *      dispatched by `apiFetch` whenever a response contains `upgrade:true`.
 *
 * Either event will pop the modal; payload differences are handled inside
 * the renderer so any surface (loads, bids, premium-gated routes, etc.)
 * gets the same conversion-focused prompt.
 *
 * CTA primary action navigates to the pricing page with the suggested plan
 * pre-anchored.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ACTION_COPY = {
  loads: { what: 'load posts', upgrade: 'unlimited posts' },
  bids:  { what: 'bids', upgrade: 'unlimited bids' },
};

const TRIGGER_TITLES = {
  LIMIT_HIT:               '🚀 Daily limit reached',
  HIGH_USAGE:              '🔥 You\'re close to today\'s limit',
  SUBSCRIPTION_REQUIRED:   '🚀 Upgrade to unlock this',
  UPGRADE_REQUIRED:        '🚀 Upgrade to unlock this',
  PRICING_VIEW:            '🚀 Pick the plan that pays you back',
};

export function QuotaExceededModal() {
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onQuotaEvent(e) {
      if (!e?.detail) return;
      // Legacy 429 shape — promote to the unified shape so the renderer
      // below has a single code-path.
      const d = e.detail;
      setDetail({
        upgrade: true,
        trigger: 'LIMIT_HIT',
        fromPlan: d.planId || 'free',
        suggestedPlan: d.suggestedPlan || (d.upgradeTo ? { code: d.upgradeTo, name: d.upgradeTo } : { code: 'premium', name: 'Premium' }),
        message: d.message || null,
        meta: { action: d.action, limit: d.limit, used: d.used, ...(d.meta || {}) },
      });
    }
    function onUpgradeEvent(e) {
      if (e?.detail) setDetail(e.detail);
    }
    window.addEventListener('quota:exceeded', onQuotaEvent);
    window.addEventListener('upgrade:required', onUpgradeEvent);
    return () => {
      window.removeEventListener('quota:exceeded', onQuotaEvent);
      window.removeEventListener('upgrade:required', onUpgradeEvent);
    };
  }, []);

  if (!detail) return null;

  const trigger = detail.trigger || 'LIMIT_HIT';
  const fromPlan = detail.fromPlan || 'free';
  const suggested = detail.suggestedPlan || { code: 'premium', name: 'Premium' };
  const action = detail.meta?.action;
  const limit  = Number(detail.meta?.limit ?? 0);
  const copy   = action ? (ACTION_COPY[action] || { what: 'this action', upgrade: 'unlimited access' }) : null;

  // Body copy: prefer server-provided message; otherwise compose from the
  // trigger + meta. The body is intentionally money-focused ("never miss
  // a load") rather than feature-focused.
  const body = detail.message || (() => {
    if (trigger === 'LIMIT_HIT' && copy && limit > 0) {
      return `You've used all ${limit} ${copy.what} on the ${fromPlan} plan today. Upgrade to ${suggested.name} for ${copy.upgrade} — never miss a load again.`;
    }
    if (trigger === 'HIGH_USAGE' && copy) {
      return `You're running out of ${copy.what} on the ${fromPlan} plan. Upgrade to ${suggested.name} so you don't miss the next load.`;
    }
    return `Upgrade to ${suggested.name} to keep earning faster.`;
  })();

  const ctaPrimary = trigger === 'PRICING_VIEW' ? 'Start Earning More' : `Upgrade to ${suggested.name}`;

  const handleUpgrade = () => {
    setDetail(null);
    const focus = (suggested.code || 'premium').toLowerCase();
    navigate(`/subscription?focus=${encodeURIComponent(focus)}`);
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
        <p className="text-3xl">{trigger === 'HIGH_USAGE' ? '⚡' : '⚠️'}</p>
        <h2 id="quota-modal-title" className="mt-2 text-2xl font-semibold text-white">
          {TRIGGER_TITLES[trigger] || TRIGGER_TITLES.LIMIT_HIT}
        </h2>
        <p className="mt-2 text-sm text-slate-300">{body}</p>
        {suggested.monthlyPrice ? (
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-orange-300">
            ₹{suggested.monthlyPrice}/mo · only ~₹{Math.max(1, Math.round(suggested.monthlyPrice / 30))}/day
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUpgrade}
            className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-lg transition hover:from-amber-300 hover:to-orange-400"
          >
            {ctaPrimary}
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
