/**
 * LoadingSkeleton — animated placeholder for search result cards while the
 * /search request is in flight.  Plain Tailwind classes; reuses the existing
 * `animate-pulse` utility instead of pulling in a new animation library.
 */
export function LoadingSkeleton({ count = 6 }) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-live="polite"
      aria-label="Loading search results"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-slate-950/40"
        >
          <div className="mb-3 h-3 w-24 rounded bg-white/10" />
          <div className="mb-2 h-5 w-3/4 rounded bg-white/15" />
          <div className="mb-4 h-4 w-1/2 rounded bg-white/10" />
          <div className="mb-2 h-3 w-full rounded bg-white/10" />
          <div className="mb-4 h-3 w-5/6 rounded bg-white/10" />
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-full bg-white/10" />
            <div className="h-8 w-20 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default LoadingSkeleton;
