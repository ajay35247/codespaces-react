import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchSavedSearches,
  deleteSavedSearch,
} from '../../features/search/searchSlice';

/**
 * SavedSearchesDrawer — lists the current user's saved searches.  Clicking
 * an entry calls `onApply(saved)` so the caller (SearchResults) can
 * navigate / re-fetch with the saved filter snapshot.
 */
export function SavedSearchesDrawer({ onApply }) {
  const dispatch = useDispatch();
  const saved = useSelector((s) => s.search.saved);
  const status = useSelector((s) => s.search.savedStatus);
  const isAuthed = useSelector((s) => Boolean(s.auth?.user));

  useEffect(() => {
    if (isAuthed && status === 'idle') {
      dispatch(fetchSavedSearches());
    }
  }, [isAuthed, status, dispatch]);

  if (!isAuthed) return null;

  return (
    <section
      aria-label="Saved searches"
      className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Saved searches</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          {saved.length} / 25
        </span>
      </header>

      {status === 'loading' && (
        <p className="mt-3 text-xs text-slate-400">Loading…</p>
      )}

      {status === 'succeeded' && saved.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Save a search from the filter panel to see it here.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {saved.map((s) => (
          <li
            key={s.id}
            className="group flex items-center justify-between rounded-xl bg-slate-950/40 px-3 py-2 text-sm hover:bg-slate-950/70"
          >
            <button
              type="button"
              onClick={() => typeof onApply === 'function' && onApply(s)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate font-medium text-white">{s.name}</p>
              <p className="truncate text-[11px] text-slate-400">
                {summarise(s)}
              </p>
            </button>
            <button
              type="button"
              onClick={() => dispatch(deleteSavedSearch(s.id))}
              aria-label={`Delete saved search ${s.name}`}
              title="Delete saved search"
              className="ml-2 rounded-full px-2 text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summarise(s) {
  const parts = [];
  if (s.query) parts.push(`"${s.query}"`);
  const f = s.filters || {};
  if (f.from || f.to) parts.push(`${f.from || '?'} → ${f.to || '?'}`);
  if (f.vehicle) parts.push(f.vehicle);
  if (f.minPrice || f.maxPrice) parts.push(`₹${f.minPrice || 0}–${f.maxPrice || '∞'}`);
  return parts.join(' · ') || 'No filters';
}

export default SavedSearchesDrawer;
