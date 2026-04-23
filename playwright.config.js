// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the single end-to-end smoke spec.
 *
 * The spec drives the full lifecycle of a load (register → login → post
 * → bid → accept → POD → release) across shipper + driver roles, which
 * gives us fast feedback when any route or component breaks cross-role
 * wiring without having to manually click through three dashboards.
 *
 * Environment variables the spec honours:
 *   E2E_BASE_URL   defaults to http://localhost:3000
 *   E2E_API_URL    defaults to http://localhost:5000/api (used via UI
 *                  only — we never call the backend directly in the spec)
 *
 * Running locally:
 *   1. Start MongoDB (docker-compose up mongo)
 *   2. Start the backend:    npm --prefix backend run dev
 *   3. Start the frontend:   npm start
 *   4. Run the spec:         npm run test:e2e
 *
 * CI integration is out of scope for this PR — it needs a MongoDB
 * service container and a test-data reset step that the existing
 * GitHub Actions workflows do not yet provide.  Tracking as a
 * follow-up so the spec is usable locally today without blocking
 * merges on infra work.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
