/**
 * ProtectedRoute component tests.
 *
 * Verifies the three gating behaviours:
 *  1. While auth is not yet "ready" → renders nothing (loading state)
 *  2. User is not authenticated → redirects to /login
 *  3. User is authenticated but wrong role → redirects to /
 *  4. User is authenticated with correct role → renders children
 */

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import { ProtectedRoute } from './ProtectedRoute';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(authState) {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: authState },
  });
}

const AUTHED_STATE = {
  user: { id: 'u1', name: 'Alice', role: 'shipper' },
  role: 'shipper',
  token: '__cookie_session__',
  loading: false,
  ready: true,
  error: null,
};

const UNAUTHED_STATE = {
  user: null,
  role: null,
  token: null,
  loading: false,
  ready: true,
  error: null,
};

const LOADING_STATE = {
  user: null,
  role: null,
  token: null,
  loading: true,
  ready: false,
  error: null,
};

function renderProtected(authState, allowedRoles = []) {
  const store = makeStore(authState);

  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={['/protected']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute allowedRoles={allowedRoles}>
                <div data-testid="protected-content">Secret Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  test('renders nothing while auth is not ready', () => {
    renderProtected(LOADING_STATE);

    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  test('redirects unauthenticated user to /login', () => {
    renderProtected(UNAUTHED_STATE);

    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  test('renders children for authenticated user with no role restriction', () => {
    renderProtected(AUTHED_STATE, []);

    expect(screen.getByTestId('protected-content')).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  test('renders children when user role matches allowedRoles', () => {
    renderProtected(AUTHED_STATE, ['shipper', 'broker']);

    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  test('redirects to / when user role is not in allowedRoles', () => {
    renderProtected(AUTHED_STATE, ['admin', 'driver']);

    expect(screen.queryByTestId('protected-content')).toBeNull();
    expect(screen.getByTestId('home-page')).toBeTruthy();
  });
});
