import { SearchResultCard } from './SearchResultCard';
import { LoadingSkeleton } from './LoadingSkeleton';

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest posted' },
  { value: 'price_desc', label: 'Highest price' },
  { value: 'nearest', label: 'Nearest' },
];

/**
 * SearchResultsGrid — the central result viewport on /search.  Owns its sort
 * dropdown and pagination controls and delegates per-card rendering to
 * SearchResultCard.  Empty / error / loading states all live here.
 */
export function SearchResultsGrid({
  results,
  status,
  error,
  pagination,
  sort,
  onSortChange,
  onPageChange,
  currentUserRole,
  onPlaceBid,
  onAcceptLoad,
  onChat,
}) {
  const isLoading = status === 'loading';
  const isError = status === 'failed';
  const isEmpty = status === 'succeeded' && (!results || results.length === 0);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {isLoading
            ? 'Searching…'
            : pagination?.total
              ? `${pagination.total.toLocaleString()} result${pagination.total === 1 ? '' : 's'}`
              : '0 results'}
        </p>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span className="text-xs uppercase tracking-wide text-slate-500">Sort</span>
          <select
            value={sort}
            onChange={(e) => onSortChange?.(e.target.value)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none transition hover:bg-white/10 focus:border-white/30"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900">
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {isLoading && <LoadingSkeleton count={6} />}

      {isError && (
        <div
          className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-rose-100"
          role="alert"
        >
          <p className="text-sm font-semibold">Search failed</p>
          <p className="mt-1 text-sm text-rose-200/80">
            {error || 'Something went wrong. Please try again.'}
          </p>
        </div>
      )}

      {isEmpty && !isLoading && !isError && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-300">
          <p className="text-base font-semibold text-white">No matching loads</p>
          <p className="mt-1 text-sm text-slate-400">
            Try a different city, vehicle type, or relax the price range.
          </p>
        </div>
      )}

      {!isLoading && !isError && results && results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((load) => (
            <SearchResultCard
              key={load.id}
              load={load}
              currentUserRole={currentUserRole}
              onPlaceBid={onPlaceBid}
              onAcceptLoad={onAcceptLoad}
              onChat={onChat}
            />
          ))}
        </div>
      )}

      {pagination && pagination.pages > 1 && !isLoading && (
        <nav className="flex items-center justify-between pt-2 text-sm text-slate-300">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange?.(pagination.page - 1)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-slate-400">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.pages}
            onClick={() => onPageChange?.(pagination.page + 1)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}

export default SearchResultsGrid;
