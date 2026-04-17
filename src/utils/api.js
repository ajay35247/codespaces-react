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