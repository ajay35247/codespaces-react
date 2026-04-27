import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlobalSearchBar } from '../components/search/GlobalSearchBar';
import { SearchResultsGrid } from '../components/search/SearchResultsGrid';
import {
  fetchSearchResults,
  searchSortChanged,
} from '../features/search/searchSlice';

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

  const requestParams = useMemo(
    () => ({
      q,
      page,
      sort: sortParam,
      from: searchParams.get('from') || '',
      to: searchParams.get('to') || '',
      vehicle: searchParams.get('vehicle') || '',
    }),
    // searchParams is a stable URLSearchParams ref managed by react-router; we
    // re-derive on each change via the dependencies below.
    [q, page, sortParam, searchParams]
  );

  useEffect(() => {
    dispatch(searchSortChanged(sortParam));
    dispatch(fetchSearchResults(requestParams));
  }, [dispatch, requestParams, sortParam]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === null || value === undefined) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    // Whenever a non-page filter changes, reset to page 1.
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const handleSortChange = (value) => updateParam('sort', value);
  const handlePageChange = (value) => updateParam('page', value);

  const handlePlaceBid = (load) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    // Bidding flow lives on the per-role dashboards; deep-link with the
    // load id so the existing bid panel can pick it up.
    navigate(`/dashboard/${user.role}?load=${encodeURIComponent(load.loadId)}#bid`);
  };

  const handleAcceptLoad = (load) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    navigate(`/driver?load=${encodeURIComponent(load.loadId)}#accept`);
  };

  const handleChat = (load) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/search?q=${q}`)}`);
      return;
    }
    navigate(`/tracking?load=${encodeURIComponent(load.loadId)}#chat`);
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-white">Search</h1>
        <GlobalSearchBar />
      </div>

      {q && (
        <p className="mb-4 text-sm text-slate-400">
          Results for <span className="font-semibold text-white">“{q}”</span>
        </p>
      )}

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
    </main>
  );
}

export default SearchResults;
