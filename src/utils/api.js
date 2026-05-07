import { captureError as _captureError } from '../services/errorReporter';

const DEFAULT_API_ORIGIN = 'http://localhost:5000';

// Mutating HTTP methods that require a CSRF token header.
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Per-endpoint circuit-breaker state.  Opened after N consecutive failures
// within a rolling window; rejects calls for `breakerOpenMs` to prevent
// retry-storm DoS on a degraded backend.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_OPEN_MS = 30_000;
const BREAKER_WINDOW_MS = 60_000;
const breakers = new Map(); // key: METHOD path, value: { failures: number[], openedAt: 0 }

function breakerKey(method, path) {
  // Strip query string + dynamic id-like segments so /loads/123 and /loads/456
  // share the same breaker.
  const cleanPath = String(path || '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
  return `${method.toUpperCase()} ${cleanPath}`;
}

function breakerState(key) {
  let s = breakers.get(key);
  if (!s) {
    s = { failures: [], openedAt: 0 };
    breakers.set(key, s);
  }
  return s;
}

function breakerAllow(key) {
  const s = breakerState(key);
  const now = Date.now();
  if (s.openedAt && (now - s.openedAt) < BREAKER_OPEN_MS) return false;
  if (s.openedAt && (now - s.openedAt) >= BREAKER_OPEN_MS) {
    // half-open: allow a single trial; reset openedAt so subsequent calls
    // queue behind the breaker again until success closes it.
    s.openedAt = 0;
    s.failures = [];
  }
  return true;
}

function breakerOnSuccess(key) {
  const s = breakerState(key);
  s.failures = [];
  s.openedAt = 0;
}

function breakerOnFailure(key) {
  const s = breakerState(key);
  const now = Date.now();
  s.failures = s.failures.filter((t) => (now - t) < BREAKER_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= BREAKER_FAILURE_THRESHOLD) {
    s.openedAt = now;
  }
}

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '');
}

function normalizePath(path = '') {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Default per-request timeout in ms. Overridable via VITE_API_TIMEOUT_MS.
 * Applied to *each* fetch attempt (initial + fallback + retry) so a stalled
 * request can never hang the UI indefinitely on a flaky mobile network.
 */
function getDefaultTimeoutMs() {
  const raw = Number(import.meta.env?.VITE_API_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 15_000;
}

/**
 * Wrap a fetch() call with an AbortController so it rejects after `timeoutMs`.
 * Honors a caller-supplied `signal` (e.g. from a higher-level AbortController)
 * by chaining cancellation: aborting the outer signal also aborts the fetch.
 *
 * Throws an Error with `name === 'TimeoutError'` on timeout so callers can
 * distinguish it from generic network errors.
 */
async function fetchWithTimeout(url, init = {}, timeoutMs) {
  const effective = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : getDefaultTimeoutMs();
  const controller = new AbortController();
  const externalSignal = init.signal;

  const timer = setTimeout(() => controller.abort(new Error('timeout')), effective);
  let externalAbortHandler = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalAbortHandler = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', externalAbortHandler, { once: true });
    }
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      // Distinguish timeout-triggered abort from a caller-initiated abort.
      if (externalSignal && externalSignal.aborted) {
        throw err;
      }
      const timeoutErr = new Error(`Request timeout after ${effective}ms`);
      timeoutErr.name = 'TimeoutError';
      timeoutErr.cause = err;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler);
    }
  }
}

export function getApiOrigin() {
  const configured = stripTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_API_ORIGIN);
  return configured.endsWith('/api') ? configured.slice(0, -4) : configured;
}

export function getApiFallbackOrigin() {
  const configured = (import.meta.env.VITE_API_FALLBACK_URL || '').toString().trim();
  if (!configured) return null;
  const stripped = stripTrailingSlash(configured);
  return stripped.endsWith('/api') ? stripped.slice(0, -4) : stripped;
}

export function getApiRootUrl() {
  return `${getApiOrigin()}/api`;
}

export function buildApiUrl(path = '') {
  return `${getApiRootUrl()}${normalizePath(path)}`;
}

function buildFallbackUrl(path = '') {
  const origin = getApiFallbackOrigin();
  if (!origin) return null;
  return `${origin}/api${normalizePath(path)}`;
}

/**
 * Read the `csrf-token` cookie that the backend sets (non-HttpOnly) alongside
 * the auth cookies at login.  The value must be echoed back in the
 * `X-CSRF-Token` header on every mutating request so the backend can perform
 * a double-submit CSRF token check.
 */
export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function createJsonHeaders(headers = {}) {
  return {
    'Content-Type': 'application/json',
    ...headers,
  };
}

function jitter(ms) {
  return ms + Math.floor(Math.random() * (ms / 2));
}

function shouldRetry(method, status, isNetworkError, retryOptIn) {
  if (isNetworkError) return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) {
    if (IDEMPOTENT_METHODS.has(method)) return true;
    return retryOptIn === true;
  }
  return false;
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function reportFailedRequest(path, method, info) {
  try {
    _captureError({
      message: `API ${method} ${path} failed: ${info}`,
      type: 'api.fetch',
      severity: 'warning',
    });
  } catch { /* swallow */ }
}

export async function apiFetch(path, options = {}) {
  const { _isRetry, _attempt = 0, retry = true, retryMaxAttempts = 3, timeoutMs, ...fetchOptions } = options;

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const csrfHeaders = CSRF_METHODS.has(method) ? { 'X-CSRF-Token': getCsrfToken() } : {};

  const key = breakerKey(method, path);
  if (!breakerAllow(key)) {
    // Fail fast to prevent piling onto a sick endpoint.
    throw new Error(`Service temporarily unavailable: ${path}`);
  }

  const targetUrl = buildApiUrl(path);
  let response;
  let networkError = null;
  try {
    response = await fetchWithTimeout(targetUrl, {
      credentials: 'include',
      ...fetchOptions,
      headers: createJsonHeaders({ ...csrfHeaders, ...fetchOptions.headers }),
    }, timeoutMs);
  } catch (err) {
    networkError = err;
  }

  // Network failure or 5xx: try fallback origin once, then exponential retry.
  if (networkError || (response && response.status >= 500)) {
    breakerOnFailure(key);
    const status = response?.status || 0;
    const fallbackUrl = !_isRetry ? buildFallbackUrl(path) : null;
    if (fallbackUrl && _attempt === 0) {
      try {
        const fbResponse = await fetchWithTimeout(fallbackUrl, {
          credentials: 'include',
          ...fetchOptions,
          headers: createJsonHeaders({ ...csrfHeaders, ...fetchOptions.headers }),
        }, timeoutMs);
        if (fbResponse.ok) {
          breakerOnSuccess(key);
          return parseApiBody(fbResponse);
        }
      } catch {
        // fall through to retry logic
      }
    }
    if (retry && _attempt < retryMaxAttempts && shouldRetry(method, status, !!networkError, options.retryOnPost)) {
      const retryAfter = parseRetryAfter(response?.headers?.get?.('retry-after'));
      const backoff = retryAfter !== null ? Math.min(retryAfter, 10_000) : jitter(300 * (2 ** _attempt));
      await new Promise((r) => setTimeout(r, backoff));
      // Pass `_isRetry: true` so the retry doesn't trigger another silent
      // token-refresh chain — the original 401 path handles refresh once and
      // shouldn't repeat from inside a 5xx-retry loop.
      return apiFetch(path, { ...options, _attempt: _attempt + 1, _isRetry: true });
    }
    reportFailedRequest(path, method, networkError ? networkError.message : `status ${status}`);
    if (networkError) throw networkError;
  }

  // Attempt a single silent token refresh when the access token has expired.
  if (response && response.status === 401 && !_isRetry) {
    const payload = await parseApiBody(response);
    if (payload?.code === 'TOKEN_EXPIRED') {
      try {
        const refreshResponse = await fetchWithTimeout(buildApiUrl('/auth/refresh-token'), {
          method: 'POST',
          credentials: 'include',
          headers: createJsonHeaders({ 'X-CSRF-Token': getCsrfToken() }),
        }, timeoutMs);
        if (refreshResponse.ok) {
          // Retry the original request once with fresh cookies.
          return apiFetch(path, { ...fetchOptions, _isRetry: true });
        }
      } catch {
        // Refresh network error – fall through and throw the original 401.
      }
    }
    breakerOnFailure(key);
    throw new Error(getApiErrorMessage(payload, 'Request failed'));
  }

  if (!response) {
    // All retries exhausted, no fallback.
    throw new Error('Network request failed');
  }

  const payload = await parseApiBody(response);

  if (!response.ok) {
    breakerOnFailure(key);
    if (response.status === 429) {
      reportFailedRequest(path, method, '429 rate-limited');
      // Surface the daily-quota signal globally so any mounted listener
      // (typically <QuotaExceededModal />) can pop the upgrade modal.
      // We only fire for the sentinel `code: 'QUOTA_EXCEEDED'` so generic
      // rate-limit 429s don't trigger a paywall.
      if (payload && typeof payload === 'object' && payload.code === 'QUOTA_EXCEEDED'
          && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('quota:exceeded', { detail: payload }));
        } catch {
          // CustomEvent is unavailable in legacy IE — we don't support it,
          // so swallowing here is fine.
        }
      }
    }
    // Standardised upgrade hint surface — any backend response that includes
    // `upgrade: true` (402 SUBSCRIPTION_REQUIRED / SUBSCRIPTION_UPGRADE_REQUIRED,
    // 429 QUOTA_EXCEEDED, or any future trigger) is forwarded to the global
    // <QuotaExceededModal /> via the `upgrade:required` event. This lets
    // every page benefit from the upgrade prompt without sprinkling per-call
    // boilerplate. We dispatch in addition to (not instead of) `quota:exceeded`
    // so existing listeners keep working.
    if (payload && typeof payload === 'object' && payload.upgrade === true
        && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('upgrade:required', { detail: payload }));
      } catch {
        // ignore — same rationale as above
      }
    }
    throw new Error(getApiErrorMessage(payload, 'Request failed'));
  }

  breakerOnSuccess(key);
  return payload;
}

export async function apiRequest(path, { method = 'GET', body, headers, retry, retryOnPost, timeoutMs, signal } = {}) {
  return apiFetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    retry,
    retryOnPost,
    timeoutMs,
    signal,
  });
}

export async function parseApiBody(response) {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText);
    } catch {
      return { rawText };
    }
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText, rawText };
  }
}

export function getApiErrorMessage(payload, fallbackMessage = 'Request failed') {
  if (!payload) {
    return fallbackMessage;
  }

  if (typeof payload === 'string') {
    if (payload.includes('DEPLOYMENT_NOT_FOUND')) {
      return 'Backend API is not deployed or the API domain is misconfigured.';
    }
    return payload;
  }

  const rawText = payload.rawText || '';
  if (rawText.includes('DEPLOYMENT_NOT_FOUND')) {
    return 'Backend API is not deployed or the API domain is misconfigured.';
  }

  return payload.error || payload.message || fallbackMessage;
}

/** Test-only inspection of breaker state. */
export const __apiInternals = { breakers, breakerKey };