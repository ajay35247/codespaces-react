/**
 * Auth slice unit tests.
 *
 * Tests cover the reducer logic (state transitions) without making real
 * network calls.  Async thunks (bootstrapSession, loginUser, etc.) are
 * tested only at the state-machine level by dispatching fulfilled /
 * rejected actions directly — no mocking of fetch is required.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  clearAuthError,
  logout,
  bootstrapSession,
  loginUser,
  registerUser,
} from './authSlice';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(preloadedState = {}) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState,
  });
}

const DEMO_USER = {
  id: 'user_123',
  name: 'Demo User',
  email: 'test@example.com',
  role: 'shipper',
};

// ── Initial state ─────────────────────────────────────────────────────────────

describe('authSlice — initial state', () => {
  test('starts with user null, role null, not ready, not loading', () => {
    const store = makeStore();
    const state = store.getState().auth;

    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.token).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.ready).toBe(false);
    expect(state.error).toBeNull();
  });
});

// ── Synchronous reducers ──────────────────────────────────────────────────────

describe('authSlice — clearAuthError', () => {
  test('clears the error field', () => {
    const store = makeStore({ auth: { user: null, role: null, token: null, loading: false, ready: true, error: 'Something went wrong' } });
    store.dispatch(clearAuthError());
    expect(store.getState().auth.error).toBeNull();
  });
});

describe('authSlice — logout', () => {
  test('clears user, role, token and marks ready', () => {
    const store = makeStore({
      auth: {
        user: DEMO_USER,
        role: 'shipper',
        token: '__cookie_session__',
        loading: false,
        ready: true,
        error: null,
      },
    });

    store.dispatch(logout());

    const state = store.getState().auth;
    expect(state.user).toBeNull();
    expect(state.role).toBeNull();
    expect(state.token).toBeNull();
    expect(state.error).toBeNull();
    expect(state.ready).toBe(true);
  });

  test('ready stays true even if it was false (logout during load)', () => {
    const store = makeStore({
      auth: { user: null, role: null, token: null, loading: true, ready: false, error: null },
    });
    store.dispatch(logout());
    expect(store.getState().auth.ready).toBe(true);
  });
});

// ── bootstrapSession thunk state transitions ──────────────────────────────────

describe('authSlice — bootstrapSession', () => {
  test('pending → loading=true, error=null', () => {
    const store = makeStore();
    store.dispatch({ type: bootstrapSession.pending.type });
    const state = store.getState().auth;
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  test('fulfilled → sets user, role, ready, token', () => {
    const store = makeStore();
    store.dispatch({
      type: bootstrapSession.fulfilled.type,
      payload: { user: DEMO_USER },
    });

    const state = store.getState().auth;
    expect(state.loading).toBe(false);
    expect(state.ready).toBe(true);
    expect(state.user).toMatchObject({ id: 'user_123', name: 'Demo User' });
    expect(state.role).toBe('shipper');
    expect(state.token).toBe('__cookie_session__');
  });

  test('fulfilled — normalises _id to id when id is absent', () => {
    const userWithoutId = { _id: 'mongo_123', name: 'Test', role: 'driver' };
    const store = makeStore();
    store.dispatch({
      type: bootstrapSession.fulfilled.type,
      payload: { user: userWithoutId },
    });

    const state = store.getState().auth;
    expect(state.user.id).toBe('mongo_123');
  });

  test('rejected → ready=true, user stays null, error set', () => {
    const store = makeStore();
    store.dispatch({
      type: bootstrapSession.rejected.type,
      payload: 'Network error',
    });

    const state = store.getState().auth;
    expect(state.loading).toBe(false);
    expect(state.ready).toBe(true);
    expect(state.user).toBeNull();
    // Null payload (unauthenticated 401) should not set a string error
  });
});

// ── loginUser thunk state transitions ─────────────────────────────────────────

describe('authSlice — loginUser', () => {
  test('pending → loading=true', () => {
    const store = makeStore();
    store.dispatch({ type: loginUser.pending.type });
    expect(store.getState().auth.loading).toBe(true);
  });

  test('fulfilled → sets user and role', () => {
    const store = makeStore();
    store.dispatch({
      type: loginUser.fulfilled.type,
      payload: { user: { ...DEMO_USER, role: 'driver' } },
    });

    const state = store.getState().auth;
    expect(state.user.role).toBe('driver');
    expect(state.role).toBe('driver');
    expect(state.loading).toBe(false);
    expect(state.ready).toBe(true);
  });

  test('rejected → stores error message', () => {
    const store = makeStore();
    store.dispatch({
      type: loginUser.rejected.type,
      payload: 'Invalid credentials',
    });

    const state = store.getState().auth;
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Invalid credentials');
  });
});

// ── registerUser thunk state transitions ──────────────────────────────────────

describe('authSlice — registerUser', () => {
  test('fulfilled → logs in the new user', () => {
    const store = makeStore();
    store.dispatch({
      type: registerUser.fulfilled.type,
      payload: { user: { ...DEMO_USER, role: 'broker' } },
    });

    const state = store.getState().auth;
    expect(state.role).toBe('broker');
    expect(state.ready).toBe(true);
  });

  test('rejected with details object → stores message', () => {
    const store = makeStore();
    store.dispatch({
      type: registerUser.rejected.type,
      payload: { message: 'Email already exists', details: [] },
    });

    const state = store.getState().auth;
    expect(state.error).toBe('Email already exists');
  });
});
