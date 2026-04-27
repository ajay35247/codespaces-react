import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSearchHistory } from '../../features/search/searchSlice';

/**
 * SearchHistoryList — recent searches and recently-viewed loads for the
 * authenticated user, sourced from `GET /search/history`.  Anonymous users
 * see a friendly placeholder rather than a dead section.
 */
export function SearchHistoryList({ onApply }) {
  const dispatch = useDispatch();
  const history = useSelector((s) => s.search.history);
  const status = useSelector((s) => s.search.historyStatus);
  const isAuthed = useSelector((s) => Boolean(s.auth?.user));

  useEffect(() => {
    if (isAuthed && status === 'idle') {
      dispatch(fetchSearchHistory(20));
    }
  }, [isAuthed, status, dispatch]);

  if (!isAuthed) {
    return (
      <section className="rounded-2xl bg-white/5 p-4 text-xs text-slate-400 ring-1 ring-white/10">
        Sign in to keep a record of your recent searches and viewed loads.
      </section>
    );
  }

  return (
    <section
      aria-label="Search history"
      className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Recent searches</h3>
      </header>

      {status === 'loading' && (
        <p className="mt-3 text-xs text-slate-400">Loading…</p>
      )}

      {status === 'succeeded' && history.length === 0 && (
        <p className="mt-3 text-xs text-slate-400">No recent searches yet.</p>
      )}

      <ul className="mt-3 space-y-1">
        {history.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => typeof onApply === 'function' && onApply(h)}
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-white/10"
            >
              <span className="text-slate-100">
                {h.query || (h.from && h.to ? `${h.from} → ${h.to}` : 'Search')}
              </span>
              {h.resultsCount > 0 && (
                <span className="ml-2 text-[11px] text-slate-500">
                  {h.resultsCount} result{h.resultsCount === 1 ? '' : 's'}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SearchHistoryList;
