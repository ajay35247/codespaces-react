/**
 * SearchSuggestions — dropdown rendered beneath the GlobalSearchBar showing
 * type-ahead suggestions sourced from /search/suggest.  Keyboard navigation
 * (ArrowUp/ArrowDown/Enter/Escape) is handled by the parent GlobalSearchBar
 * because that component owns the input element and focus.
 */
const TYPE_LABELS = {
  loadId: 'Load',
  origin: 'From',
  destination: 'To',
  vehicle: 'Vehicle',
};

export function SearchSuggestions({
  suggestions,
  activeIndex,
  onSelect,
  loading,
  query,
}) {
  if (!query || query.trim().length < 2) {
    return null;
  }

  return (
    <ul
      role="listbox"
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl shadow-slate-950/60 backdrop-blur"
    >
      {loading && suggestions.length === 0 && (
        <li className="px-4 py-3 text-sm text-slate-400">Searching…</li>
      )}
      {!loading && suggestions.length === 0 && (
        <li className="px-4 py-3 text-sm text-slate-400">
          No suggestions. Press Enter to search anyway.
        </li>
      )}
      {suggestions.map((s, idx) => {
        const isActive = idx === activeIndex;
        return (
          <li
            key={`${s.type}:${s.value}:${idx}`}
            role="option"
            aria-selected={isActive}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                // onMouseDown so the click registers before the input's
                // onBlur closes the dropdown.
                e.preventDefault();
                onSelect?.(s);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              <span className="truncate">{s.value}</span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-300">
                {TYPE_LABELS[s.type] || s.type}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default SearchSuggestions;
