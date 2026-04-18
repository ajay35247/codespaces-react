import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
  parseCookieHeader,
} from './authorize.js';
import { getAllowedOriginsSet } from '../config/origins.js';

function normalizeOrigin(value) {
  return String(value || '').replace(/\/$/, '');
}

function requestHasAuthCookie(req) {
  const cookies = req.cookies || parseCookieHeader(req.headers.cookie);
  return Boolean(
    cookies[USER_ACCESS_COOKIE]
      || cookies[USER_REFRESH_COOKIE]
      || cookies[ADMIN_ACCESS_COOKIE]
      || cookies[ADMIN_REFRESH_COOKIE]
  );
}

function getRequestOrigin(req) {
  const origin = req.get('origin');
  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = req.get('referer');
  if (!referer) {
    return '';
  }

  try {
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return '';
  }
}

export function enforceTrustedOriginForCookieAuth(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  if (!requestHasAuthCookie(req) || req.get('authorization')) {
    return next();
  }

  const requestOrigin = getRequestOrigin(req);
  const allowedOrigins = getAllowedOriginsSet();

  if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
    return res.status(403).json({ error: 'Forbidden: invalid request origin' });
  }

  return next();
}