import { useEffect, useState } from 'react';
import { apiRequest } from '../utils/api';

/**
 * Compact star + numeric badge for a user's aggregate rating.  Lazily fetches
 * `/loads/users/:userId/rating-summary` from the backend so it can be dropped
 * into any list row without parent state plumbing.  Renders nothing while
 * loading and a muted "no ratings yet" hint when the user has zero ratings.
 */
export function RatingBadge({ userId, size = 'sm' }) {
  const [summary, setSummary] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiRequest(`/loads/users/${userId}/rating-summary`)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId]);

  if (!loaded) return null;
  if (!summary || !summary.totalCount) {
    return <span className="text-[10px] uppercase tracking-wide text-slate-500">No ratings yet</span>;
  }
  const sizeClass = size === 'lg' ? 'text-sm' : 'text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-300 ${sizeClass}`}>
      <span aria-hidden>★</span>
      <span className="tabular-nums">{summary.avgStars?.toFixed(1)}</span>
      <span className="text-amber-200/70">({summary.totalCount})</span>
    </span>
  );
}

/**
 * Inline "Verified" pill.  Accepts a `status` string ('pending'|'approved'|
 * 'rejected') — renders green with a checkmark when approved; otherwise
 * shows nothing so non-approved users don't get a negative stigma badge.
 */
export function VerifiedBadge({ status }) {
  if (status !== 'approved') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
      <span aria-hidden>✔</span>
      <span>KYC verified</span>
    </span>
  );
}

/**
 * Inline 1–5 star picker used inside rating modals.  Controlled via `value`
 * (1..5 or 0 for unset) and `onChange`.  Keyboard-accessible — each star is
 * a real button.
 */
export function StarPicker({ value, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => !disabled && onChange(n)}
          disabled={disabled}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`text-2xl leading-none transition ${
            n <= value ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300'
          } disabled:cursor-not-allowed`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
