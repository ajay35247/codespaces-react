const DEFAULT_API_ORIGIN = 'http://localhost:5000';

// Mutating HTTP methods that require a CSRF token header.
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function stripTrailingSlash(value = '') {
  return value.replace(/\/+$/, '');
}

function normalizePath(path = '') {
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
}

export function getApiOrigin() {
  const configured = stripTrailingSlash(import.meta.env.VITE_API_URL || DEFAULT_API_ORIGIN);
  return configured.endsWith('/api') ? configured.slice(0, -4) : configured;
}

export function getApiRootUrl() {
  return `${getApiOrigin()}/api`;
}

export function buildApiUrl(path = '') {
  return `${getApiRootUrl()}${normalizePath(path)}`;
}

/**
 * Read the `csrf-token` cookie that the backend sets (non-HttpOnly) alongside
 * the auth cookies at login.  The value must be echoed back in the
 * `X-CSRF-Token` header on every mutating request so the backend can perform
 * a double-submit CSRF token check.
 */
function getCsrfToken() {
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

export async function apiFetch(path, options = {}) {
  const { _isRetry, ...fetchOptions } = options;

  // Attach CSRF token header for all mutating requests so the backend
  // double-submit check passes.
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const csrfHeaders = CSRF_METHODS.has(method) ? { 'X-CSRF-Token': getCsrfToken() } : {};

  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...fetchOptions,
    headers: createJsonHeaders({ ...csrfHeaders, ...fetchOptions.headers }),
  });

  // Attempt a single silent token refresh when the access token has expired.
  if (response.status === 401 && !_isRetry) {
    const payload = await parseApiBody(response);
    if (payload?.code === 'TOKEN_EXPIRED') {
      try {
        const refreshResponse = await fetch(buildApiUrl('/auth/refresh-token'), {
          method: 'POST',
          credentials: 'include',
          headers: createJsonHeaders({ 'X-CSRF-Token': getCsrfToken() }),
        });
        if (refreshResponse.ok) {
          // Retry the original request once with fresh cookies.
          return apiFetch(path, { ...fetchOptions, _isRetry: true });
        }
      } catch {
        // Refresh network error – fall through and throw the original 401.
      }
    }
    throw new Error(getApiErrorMessage(payload, 'Request failed'));
  }

  const payload = await parseApiBody(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, 'Request failed'));
  }

  return payload;
}

export async function apiRequest(path, { method = 'GET', body, headers } = {}) {
  return apiFetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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