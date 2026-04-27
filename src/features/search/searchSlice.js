import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiRequest, apiFetch } from '../../utils/api';

/**
 * Build a `?key=value&...` querystring, dropping empty/null/undefined values
 * so the backend's strict Joi schema (which rejects unknown / empty fields
 * on some keys) is not tripped by the UI.
 */
function buildQueryString(params = {}) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    usp.append(key, String(value));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export const fetchSearchResults = createAsyncThunk(
  'search/fetchResults',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await apiRequest(`/search${buildQueryString(params)}`);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchSearchSuggestions = createAsyncThunk(
  'search/fetchSuggestions',
  async (q, { rejectWithValue, signal }) => {
    if (!q || q.trim().length < 2) {
      return { suggestions: [] };
    }
    try {
      // Use apiFetch so we can attach an AbortSignal — stale debounced calls
      // cancel themselves when the user keeps typing.
      return await apiFetch(`/search/suggest?q=${encodeURIComponent(q.trim())}`, {
        method: 'GET',
        signal,
      });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchSavedSearches = createAsyncThunk(
  'search/fetchSaved',
  async (_arg, { rejectWithValue }) => {
    try {
      return await apiRequest('/search/saved');
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const createSavedSearch = createAsyncThunk(
  'search/createSaved',
  async ({ name, query, filters }, { rejectWithValue }) => {
    try {
      return await apiRequest('/search/saved', {
        method: 'POST',
        body: { name, query: query || '', filters: filters || {} },
      });
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const deleteSavedSearch = createAsyncThunk(
  'search/deleteSaved',
  async (id, { rejectWithValue }) => {
    try {
      await apiRequest(`/search/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { id };
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchSearchHistory = createAsyncThunk(
  'search/fetchHistory',
  async (limit = 20, { rejectWithValue }) => {
    try {
      return await apiRequest(`/search/history?limit=${encodeURIComponent(limit)}`);
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const fetchTrending = createAsyncThunk(
  'search/fetchTrending',
  async (_arg, { rejectWithValue }) => {
    try {
      return await apiRequest('/search/trending');
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const recordSearchEvent = createAsyncThunk(
  'search/recordEvent',
  async ({ loadId, query }, { rejectWithValue }) => {
    try {
      await apiRequest('/search/event', {
        method: 'POST',
        body: { loadId, query: query || '' },
      });
      return { loadId };
    } catch (err) {
      // Best-effort; never surface as a user-facing error.
      return rejectWithValue(err.message);
    }
  }
);

const initialState = {
  query: '',
  results: [],
  pagination: { page: 1, limit: 20, total: 0, pages: 0 },
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
  suggestions: [],
  suggestionsStatus: 'idle',
  sort: 'latest',
  filters: {
    from: '',
    to: '',
    vehicle: '',
    loadType: '',
    minPrice: '',
    maxPrice: '',
    dateFrom: '',
    dateTo: '',
    distancePreference: '',
  },
  filtersEnabled: {
    from: true, to: true, vehicle: true, loadType: true,
    price: true, date: true, distancePreference: true,
  },
  filtersPanelOpen: false,
  // Saved searches + history
  saved: [],
  savedStatus: 'idle',
  history: [],
  historyStatus: 'idle',
  // Trending routes (Phase 3)
  trending: [],
  trendingStatus: 'idle',
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    searchQueryChanged(state, action) {
      state.query = action.payload || '';
    },
    searchSortChanged(state, action) {
      state.sort = action.payload || 'latest';
    },
    searchReset() {
      return initialState;
    },
    suggestionsCleared(state) {
      state.suggestions = [];
      state.suggestionsStatus = 'idle';
    },
    filtersPanelToggled(state, action) {
      state.filtersPanelOpen = typeof action.payload === 'boolean'
        ? action.payload
        : !state.filtersPanelOpen;
    },
    filtersChanged(state, action) {
      state.filters = { ...state.filters, ...(action.payload || {}) };
    },
    filtersCleared(state) {
      state.filters = { ...initialState.filters };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSearchResults.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchSearchResults.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.results = Array.isArray(action.payload?.results) ? action.payload.results : [];
        state.pagination = action.payload?.pagination || initialState.pagination;
        if (action.payload?.filtersEnabled && typeof action.payload.filtersEnabled === 'object') {
          state.filtersEnabled = { ...state.filtersEnabled, ...action.payload.filtersEnabled };
        }
      })
      .addCase(fetchSearchResults.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Search failed';
      })
      .addCase(fetchSearchSuggestions.pending, (state) => {
        state.suggestionsStatus = 'loading';
      })
      .addCase(fetchSearchSuggestions.fulfilled, (state, action) => {
        state.suggestionsStatus = 'succeeded';
        state.suggestions = Array.isArray(action.payload?.suggestions)
          ? action.payload.suggestions
          : [];
      })
      .addCase(fetchSearchSuggestions.rejected, (state) => {
        state.suggestionsStatus = 'failed';
        state.suggestions = [];
      })
      // Saved searches
      .addCase(fetchSavedSearches.pending, (state) => { state.savedStatus = 'loading'; })
      .addCase(fetchSavedSearches.fulfilled, (state, action) => {
        state.savedStatus = 'succeeded';
        state.saved = Array.isArray(action.payload?.saved) ? action.payload.saved : [];
      })
      .addCase(fetchSavedSearches.rejected, (state) => { state.savedStatus = 'failed'; })
      .addCase(createSavedSearch.fulfilled, (state, action) => {
        const next = action.payload?.saved;
        if (!next) return;
        const idx = state.saved.findIndex((s) => s.id === next.id);
        if (idx >= 0) state.saved[idx] = next;
        else state.saved.unshift(next);
      })
      .addCase(deleteSavedSearch.fulfilled, (state, action) => {
        state.saved = state.saved.filter((s) => s.id !== action.payload?.id);
      })
      // History
      .addCase(fetchSearchHistory.pending, (state) => { state.historyStatus = 'loading'; })
      .addCase(fetchSearchHistory.fulfilled, (state, action) => {
        state.historyStatus = 'succeeded';
        state.history = Array.isArray(action.payload?.history) ? action.payload.history : [];
      })
      .addCase(fetchSearchHistory.rejected, (state) => { state.historyStatus = 'failed'; })
      // Trending
      .addCase(fetchTrending.pending, (state) => { state.trendingStatus = 'loading'; })
      .addCase(fetchTrending.fulfilled, (state, action) => {
        state.trendingStatus = 'succeeded';
        state.trending = Array.isArray(action.payload?.trending) ? action.payload.trending : [];
      })
      .addCase(fetchTrending.rejected, (state) => { state.trendingStatus = 'failed'; });
  },
});

export const {
  searchQueryChanged,
  searchSortChanged,
  searchReset,
  suggestionsCleared,
  filtersPanelToggled,
  filtersChanged,
  filtersCleared,
} = searchSlice.actions;

export default searchSlice.reducer;
