import { useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalSearchBar } from '../components/search/GlobalSearchBar';
import { SearchResultsGrid } from '../components/search/SearchResultsGrid';
import { SearchFiltersPanel } from '../components/search/SearchFiltersPanel';
import { SavedSearchesDrawer } from '../components/search/SavedSearchesDrawer';
import { SearchHistoryList } from '../components/search/SearchHistoryList';
import { TrendingRoutes } from '../components/search/TrendingRoutes';
import {
  fetchSearchResults,
  filtersPanelToggled,
  filtersChanged,
  recordSearchEvent,
  searchSortChanged,
} from '../features/search/searchSlice';
import { useSocket } from '../hooks/useSocket';

const FILTER_KEYS = [
  'from', 'to', 'vehicle', 'loadType', 'minPrice', 'maxPrice',
  'dateFrom', 'dateTo', 'distancePreference',
];

/**
 * SearchResults — the dedicated `/search` page.  Drives its data fetch
 * directly from URL params so deep-links (e.g. shared from the bar) reload
 * cleanly, and so the back/forward buttons reproduce a previous query.
 */
export function SearchResults() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useSelector((s) => s.auth.user);
  const { results, status, error, pagination, sort } = useSelector((s) => s.search);

  const q = searchParams.get('q') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const sortParam = searchParams.get('sort') || 'latest';

  const requestParams = useMemo(() => {
    const out = { q, page, sort: sortParam };
    for (const key of FILTER_KEYS) {
      const v = searchParams.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [q, page, sortParam, searchParams]);

  // Hydrate Redux filter state from the URL so the filters panel renders
  // the active selections when it opens.
  useEffect(() => {
    const patch = {};
    for (const key of FILTER_KEYS) patch[key] = searchParams.get(key) || '';
    dispatch(filtersChanged(patch));
  }, [searchParams, dispatch]);

  useEffect(() => {
    dispatch(searchSortChanged(sortParam));
    dispatch(fetchSearchResults(requestParams));
  }, [dispatch, requestParams, sortParam]);

  // Real-time invalidation: when the marketplace shifts (load created /
  // status changed / new bid placed) the backend broadcasts
  // `search:invalidate`.  Refetch the visible page in place; the user does
  // not need to do anything.
  const refetchVisiblePage = useCallback(() => {
    dispatch(fetchSearchResults(requestParams));
  }, [dispatch, requestParams]);
  useSocket('search:invalidate', refetchVisiblePage);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === null || value === undefined) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const updateManyParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) next.delete(k);
      else next.set(k, String(v));
    });
    next.delete('page');
    setSearchParams(next);
  };

  const handleSortChange = (value) => updateParam('sort', value);
  const handlePageChange = (value) => updateParam('page', value);

  const recordClick = (load) => {
    if (!user || !load?.loadId) return;
    dispatch(recordSearchEvent({ loadId: load.loadId, query: q }));
  };

  const handlePlaceBid = (load) => {
    recordClick(load);
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    navigate(`/dashboard/${user.role}?load=${encodeURIComponent(load.loadId)}#bid`);
  };

  const handleAcceptLoad = (load) => {
    recordClick(load);
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    navigate(`/driver?load=${encodeURIComponent(load.loadId)}#accept`);
  };

  const handleChat = (load) => {
    recordClick(load);
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    navigate(`/tracking?load=${encodeURIComponent(load.loadId)}#chat`);
  };

  const applyFilters = (filters) => {
    const patch = {};
    for (const key of FILTER_KEYS) {
      patch[key] = filters?.[key] ? String(filters[key]) : '';
    }
    updateManyParams(patch);
  };

  const applySaved = (saved) => {
    const patch = { q: saved?.query || '' };
    for (const key of FILTER_KEYS) {
      patch[key] = saved?.filters?.[key] ? String(saved.filters[key]) : '';
    }
    updateManyParams(patch);
  };

  const applyHistory = (h) => {
    updateManyParams({ q: h?.query || '', from: h?.from || '', to: h?.to || '' });
  };

  const applyTrending = (t) => {
    updateManyParams({ q: '', from: t?.from || '', to: t?.to || '' });
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-white">Search</h1>
          <button
            type="button"
            onClick={() => dispatch(filtersPanelToggled(true))}
            className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            Filters
          </button>
        </div>
        <GlobalSearchBar />
      </div>

      {q && (
        <p className="mb-4 text-sm text-slate-400">
          Results for <span className="font-semibold text-white">“{q}”</span>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <SearchResultsGrid
          results={results}
          status={status}
          error={error}
          pagination={pagination}
          sort={sort}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          currentUserRole={user?.role}
          onPlaceBid={handlePlaceBid}
          onAcceptLoad={handleAcceptLoad}
          onChat={handleChat}
        />

        <aside className="space-y-4">
          <TrendingRoutes onApply={applyTrending} />
          <SearchHistoryList onApply={applyHistory} />
          <SavedSearchesDrawer onApply={applySaved} />
        </aside>
      </div>

      <SearchFiltersPanel onApply={applyFilters} />
    </main>
  );
}

export default SearchResults;
