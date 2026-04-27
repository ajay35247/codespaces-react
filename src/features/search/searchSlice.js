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

const initialState = {
  query: '',
  results: [],
  pagination: { page: 1, limit: 20, total: 0, pages: 0 },
  status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
  error: null,
  suggestions: [],
  suggestionsStatus: 'idle',
  sort: 'latest',
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
      });
  },
});

export const {
  searchQueryChanged,
  searchSortChanged,
  searchReset,
  suggestionsCleared,
} = searchSlice.actions;

export default searchSlice.reducer;
