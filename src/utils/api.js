const DEFAULT_API_ORIGIN = 'http://localhost:5000';

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

export function createJsonHeaders(headers = {}) {
  return {
    'Content-Type': 'application/json',
    ...headers,
  };
}

export async function apiFetch(path, options = {}) {
  const { _isRetry, ...fetchOptions } = options;

  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...fetchOptions,
    headers: createJsonHeaders(fetchOptions.headers),
  });

  // Attempt a single silent token refresh when the access token has expired.
  if (response.status === 401 && !_isRetry) {
    const payload = await parseApiBody(response);
    if (payload?.code === 'TOKEN_EXPIRED') {
      try {
        const refreshResponse = await fetch(buildApiUrl('/auth/refresh-token'), {
          method: 'POST',
          credentials: 'include',
          headers: createJsonHeaders(),
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