import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchSearchSuggestions, suggestionsCleared } from '../../features/search/searchSlice';
import { SearchSuggestions } from './SearchSuggestions';
import { VoiceSearchButton } from './VoiceSearchButton';

const SUGGEST_DEBOUNCE_MS = 200;

/**
 * GlobalSearchBar — sticky universal search bar mounted in the public nav and
 * inside the dashboard shell so every page has a consistent search entry
 * point.  Visible to all roles (Admin, Shipper, Truck Owner, Driver, Broker)
 * and to unauthenticated visitors.
 *
 * Behaviour:
 *   - Debounced (200 ms) `/search/suggest` calls while typing.
 *   - ArrowUp/ArrowDown to traverse the suggestions list, Enter to commit.
 *   - Escape clears the dropdown without losing the input contents.
 *   - Submitting navigates to `/search?q=...` so the SearchResults page can
 *     drive its own data fetch from URL parameters.
 *
 * The component is intentionally presentation-only with respect to results —
 * results themselves live on the dedicated `/search` page so deep-linking
 * works and search state survives a refresh.
 */
export function GlobalSearchBar({ compact = false, autoFocus = false }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const suggestions = useSelector((s) => s.search.suggestions);
  const suggestionsStatus = useSelector((s) => s.search.suggestionsStatus);

  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const inflightRef = useRef(null);

  // Debounced suggestion fetch with abort on subsequent keystrokes.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (inflightRef.current) {
      inflightRef.current.abort?.();
      inflightRef.current = null;
    }

    if (!value || value.trim().length < 2) {
      dispatch(suggestionsCleared());
      return undefined;
    }

    debounceRef.current = setTimeout(() => {
      const promise = dispatch(fetchSearchSuggestions(value));
      inflightRef.current = promise;
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, dispatch]);

  // Close the dropdown when a click lands outside the bar.
  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const submit = useCallback(
    (override) => {
      const q = (override ?? value).trim();
      setOpen(false);
      setActiveIndex(-1);
      const target = q ? `/search?q=${encodeURIComponent(q)}` : '/search';
      navigate(target);
    },
    [value, navigate]
  );

  const handleSelectSuggestion = useCallback(
    (s) => {
      setValue(s.value);
      submit(s.value);
    },
    [submit]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActiveIndex((idx) => (idx <= 0 ? suggestions.length - 1 : idx - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelectSuggestion(suggestions[activeIndex]);
      } else {
        submit();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${compact ? 'max-w-md' : 'max-w-3xl'}`}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 shadow-lg shadow-slate-950/40 transition focus-within:border-white/30 focus-within:bg-white/10"
      >
        <span className="text-slate-400" aria-hidden="true">
          🔍
        </span>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search loads, routes, bids, locations..."
          aria-label="Universal search"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-400 outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              dispatch(suggestionsCleared());
              inputRef.current?.focus();
            }}
            className="rounded-full px-2 text-slate-400 hover:text-slate-200"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
        <VoiceSearchButton
          onResult={(text) => {
            setValue(text);
            // Submit immediately on a successful voice transcript so the
            // user lands on the results page without a second tap.
            submit(text);
          }}
        />
        <button
          type="submit"
          className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-white/25"
        >
          Search
        </button>
      </form>

      {open && (
        <SearchSuggestions
          query={value}
          suggestions={suggestions}
          activeIndex={activeIndex}
          loading={suggestionsStatus === 'loading'}
          onSelect={handleSelectSuggestion}
        />
      )}
    </div>
  );
}

export default GlobalSearchBar;
