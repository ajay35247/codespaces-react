import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTrending } from '../../features/search/searchSlice';

/**
 * TrendingRoutes — top origin → destination pairs over the last 7 days,
 * sourced from `GET /search/trending`.  Public endpoint, so we render it
 * for anonymous visitors too.
 */
export function TrendingRoutes({ onApply }) {
  const dispatch = useDispatch();
  const trending = useSelector((s) => s.search.trending);
  const status = useSelector((s) => s.search.trendingStatus);

  useEffect(() => {
    if (status === 'idle') dispatch(fetchTrending());
  }, [status, dispatch]);

  if (status === 'failed') return null;
  if (status === 'succeeded' && trending.length === 0) return null;

  return (
    <section
      aria-label="Trending routes"
      className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Trending routes</h3>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">last 7 days</span>
      </header>

      {status === 'loading' && (
        <p className="mt-3 text-xs text-slate-400">Loading…</p>
      )}

      <ul className="mt-3 flex flex-wrap gap-2">
        {trending.map((t, i) => (
          <li key={`${t.from}|${t.to}|${i}`}>
            <button
              type="button"
              onClick={() => typeof onApply === 'function' && onApply(t)}
              className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/20"
            >
              {t.from} → {t.to}
              <span className="ml-1 text-[10px] text-cyan-300/80">×{t.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TrendingRoutes;
