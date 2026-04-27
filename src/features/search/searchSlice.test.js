import { describe, it, expect } from 'vitest';
import searchReducer, {
  searchQueryChanged,
  searchSortChanged,
  searchReset,
  suggestionsCleared,
  fetchSearchResults,
  fetchSearchSuggestions,
} from './searchSlice';

const initial = searchReducer(undefined, { type: '@@INIT' });

describe('searchSlice', () => {
  it('exposes a sane initial state', () => {
    expect(initial.query).toBe('');
    expect(initial.results).toEqual([]);
    expect(initial.status).toBe('idle');
    expect(initial.suggestions).toEqual([]);
    expect(initial.sort).toBe('latest');
  });

  it('updates query and sort via reducer actions', () => {
    let state = searchReducer(initial, searchQueryChanged('Mumbai'));
    expect(state.query).toBe('Mumbai');

    state = searchReducer(state, searchSortChanged('price_desc'));
    expect(state.sort).toBe('price_desc');
  });

  it('clears suggestions in place without losing query/results', () => {
    let state = searchReducer(initial, searchQueryChanged('Delhi'));
    state = {
      ...state,
      suggestions: [{ type: 'origin', value: 'Delhi' }],
      suggestionsStatus: 'succeeded',
    };
    state = searchReducer(state, suggestionsCleared());
    expect(state.suggestions).toEqual([]);
    expect(state.suggestionsStatus).toBe('idle');
    expect(state.query).toBe('Delhi');
  });

  it('resets fully via searchReset', () => {
    let state = searchReducer(initial, searchQueryChanged('hi'));
    state = searchReducer(state, searchReset());
    expect(state).toEqual(initial);
  });

  it('handles fetchSearchResults lifecycle', () => {
    const pending = searchReducer(initial, { type: fetchSearchResults.pending.type });
    expect(pending.status).toBe('loading');
    expect(pending.error).toBeNull();

    const fulfilled = searchReducer(pending, {
      type: fetchSearchResults.fulfilled.type,
      payload: {
        results: [{ id: 'a', loadId: 'L-1' }],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      },
    });
    expect(fulfilled.status).toBe('succeeded');
    expect(fulfilled.results).toHaveLength(1);
    expect(fulfilled.pagination.total).toBe(1);

    const rejected = searchReducer(pending, {
      type: fetchSearchResults.rejected.type,
      payload: 'boom',
    });
    expect(rejected.status).toBe('failed');
    expect(rejected.error).toBe('boom');
  });

  it('handles fetchSearchSuggestions lifecycle', () => {
    const pending = searchReducer(initial, { type: fetchSearchSuggestions.pending.type });
    expect(pending.suggestionsStatus).toBe('loading');

    const fulfilled = searchReducer(pending, {
      type: fetchSearchSuggestions.fulfilled.type,
      payload: { suggestions: [{ type: 'origin', value: 'Mumbai' }] },
    });
    expect(fulfilled.suggestionsStatus).toBe('succeeded');
    expect(fulfilled.suggestions).toHaveLength(1);

    const rejected = searchReducer(pending, {
      type: fetchSearchSuggestions.rejected.type,
    });
    expect(rejected.suggestionsStatus).toBe('failed');
    expect(rejected.suggestions).toEqual([]);
  });
});
