import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// jsdom does not implement IntersectionObserver — stub it so components that
// use it (lazy-load triggers, animation observers) don't crash in tests.
global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

test('renders the Speedy Trucks app header', () => {
  render(<App />);
  // The nav/header always renders regardless of auth state.
  const headings = screen.getAllByText(/Speedy Trucks/i);
  expect(headings.length).toBeGreaterThan(0);
});
