import crypto from 'crypto';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  USER_ACCESS_COOKIE,
  USER_REFRESH_COOKIE,
  CSRF_COOKIE,
  parseCookieHeader,
} from './authorize.js';
import { getAllowedOriginsSet } from '../config/origins.js';
import { isCapacitorOrigin } from '../config/capacitorOrigins.js';

function normalizeOrigin(value) {
  return String(value || '').replace(/\/$/, '');
}

function getRequestCookies(req) {
  return req.cookies || parseCookieHeader(req.headers.cookie);
}

function requestHasAuthCookie(req) {
  const cookies = getRequestCookies(req);
  return Boolean(
    cookies[USER_ACCESS_COOKIE]
      || cookies[USER_REFRESH_COOKIE]
      || cookies[ADMIN_ACCESS_COOKIE]
      || cookies[ADMIN_REFRESH_COOKIE]
  );
}

/**
 * Public credential-exchange endpoints that re-establish or recover an auth
 * session from user-supplied credentials (email + password / reset token).
 *
 * These routes MUST stay reachable even when the browser still has stale auth
 * cookies from a previous session whose matching `csrf-token` cookie has
 * since expired or been cleared. Without this exemption a returning user
 * would be permanently locked out of `/login` with
 * "Forbidden: missing CSRF token" until they manually wiped their cookies.
 *
 * CSRF protection is not weakened: these endpoints are public (no privileged
 * side effects on the existing session) — the credential check is the auth.
 * The trusted-origin defence-in-depth check below still runs, blocking
 * cross-site automated submissions.
 */
const PUBLIC_AUTH_BOOTSTRAP_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/request-password-reset',
  '/auth/reset-password',
  // Same paths under the `/api` prefix, in case the middleware is ever
  // mounted at the application root rather than under `app.use('/api', …)`.
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
]);

export function isPublicAuthBootstrapPath(path) {
  return PUBLIC_AUTH_BOOTSTRAP_PATHS.has(String(path || ''));
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

/**
 * Double-submit CSRF token check.
 *
 * For every mutating (POST / PUT / PATCH / DELETE) request that is
 * authenticated via a cookie the frontend MUST:
 *   1. Read the non-HttpOnly `csrf-token` cookie that was set alongside the
 *      auth cookies at login.
 *   2. Include that value verbatim in the `X-CSRF-Token` request header.
 *
 * The middleware verifies that the header value matches the cookie value using
 * a timing-safe comparison so that the check is recognisable to static
 * analysis tools as a real token validation.
 *
 * Requests that use a Bearer token (`Authorization` header) bypass the cookie
 * CSRF check because they are not vulnerable to cross-site request forgery by
 * design.
 *
 * As a defence-in-depth layer the Origin / Referer header is also verified
 * against the configured allowed-origins list.
 */
export function enforceTrustedOriginForCookieAuth(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  // Requests authenticated with a Bearer token are not vulnerable to CSRF.
  if (req.get('authorization')) {
    return next();
  }

  // Public credential-exchange endpoints (login / register / password reset)
  // bypass the *cookie-based double-submit CSRF check* so a returning user
  // with stale auth cookies from a previous session — whose matching
  // `csrf-token` cookie has since expired or been cleared — can still
  // re-authenticate. The trusted-origin defence-in-depth check below is
  // still applied so cross-site form posts to /auth/login are blocked.
  // See PUBLIC_AUTH_BOOTSTRAP_PATHS above for the rationale.
  const isPublicAuthBootstrap = isPublicAuthBootstrapPath(req.path);

  // Public endpoints that carry no auth cookies (e.g. Razorpay webhook, public
  // support-contact form) are not subject to CSRF protection.
  if (!isPublicAuthBootstrap && !requestHasAuthCookie(req)) {
    return next();
  }

  // Capacitor / native-WebView origins: see config/capacitorOrigins.js for
  // the rationale. Skip the strict double-submit check for authenticated
  // requests from these first-party native origins; the cookie auth
  // (HttpOnly access token) remains in force and the trusted-origin check
  // below still applies.
  const incomingOrigin = getRequestOrigin(req);
  const isCapacitor = isCapacitorOrigin(incomingOrigin);

  // ── Double-submit CSRF token validation ────────────────────────────────────
  // The frontend reads the `csrf-token` cookie (non-HttpOnly) and echoes it
  // back as the `X-CSRF-Token` request header.  We compare them here.
  const cookies = getRequestCookies(req);
  const cookieToken = String(cookies[CSRF_COOKIE] || '');
  const headerToken = String(req.get('x-csrf-token') || '');

  if (!isCapacitor && !isPublicAuthBootstrap) {
    if (!cookieToken || !headerToken) {
      return res.status(403).json({ error: 'Forbidden: missing CSRF token' });
    }

    try {
      const cookieBuf = Buffer.from(cookieToken, 'utf8');
      const headerBuf = Buffer.from(headerToken, 'utf8');
      if (
        cookieBuf.length !== headerBuf.length
        || !crypto.timingSafeEqual(cookieBuf, headerBuf)
      ) {
        return res.status(403).json({ error: 'Forbidden: invalid CSRF token' });
      }
    } catch {
      return res.status(403).json({ error: 'Forbidden: invalid CSRF token' });
    }
  }

  // ── Defence-in-depth: trusted origin check ─────────────────────────────────
  const allowedOrigins = getAllowedOriginsSet();

  // Capacitor origins are always considered trusted at the origin layer too.
  if (isCapacitor) {
    return next();
  }

  if (!incomingOrigin || !allowedOrigins.has(incomingOrigin)) {
    return res.status(403).json({ error: 'Forbidden: invalid request origin' });
  }

  return next();
}