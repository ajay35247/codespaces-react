import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAdminEmail, normalizeEmail } from '../utils/securityPolicy.js';

export const USER_ACCESS_COOKIE = 'st_access';
export const USER_REFRESH_COOKIE = 'st_refresh';
export const ADMIN_ACCESS_COOKIE = 'st_admin_access';
export const ADMIN_REFRESH_COOKIE = 'st_admin_refresh';

function getJwtConfig() {
  const jwtSecret = process.env.JWT_SECRET || 'speedy-trucks-ephemeral-jwt-secret';
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || `${jwtSecret}-refresh`;
  const jwtExpire = process.env.JWT_EXPIRE || '15m';
  const jwtRefreshExpire = process.env.JWT_REFRESH_EXPIRE || '7d';

  return {
    jwtSecret,
    jwtRefreshSecret,
    jwtExpire,
    jwtRefreshExpire,
  };
}

function isSecureCookieRequest() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

function getCookieDomain() {
  return process.env.AUTH_COOKIE_DOMAIN || undefined;
}

function getCookieSameSite() {
  const value = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  if (!['lax', 'strict', 'none'].includes(value)) {
    return 'lax';
  }
  if (value === 'none' && !isSecureCookieRequest()) {
    return 'lax';
  }
  return value;
}

function getCookieOptions(maxAgeMs, httpOnly = true) {
  return {
    httpOnly,
    secure: isSecureCookieRequest(),
    sameSite: getCookieSameSite(),
    domain: getCookieDomain(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function parseCookieHeader(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return cookies;
      }

      const key = decodeURIComponent(part.slice(0, separator).trim());
      const value = decodeURIComponent(part.slice(separator + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

function getRequestCookies(req) {
  if (req.cookies && typeof req.cookies === 'object') {
    return req.cookies;
  }

  return parseCookieHeader(req.headers?.cookie);
}

// CSRF double-submit cookie name.  This cookie is NOT HttpOnly so that the
// browser-side JavaScript can read it and echo it back as the X-CSRF-Token
// request header on every mutating request.
export const CSRF_COOKIE = 'csrf-token';

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function setAuthCookies(res, { accessToken, refreshToken, admin = false }) {
  const accessCookieName = admin ? ADMIN_ACCESS_COOKIE : USER_ACCESS_COOKIE;
  const refreshCookieName = admin ? ADMIN_REFRESH_COOKIE : USER_REFRESH_COOKIE;
  const { jwtExpire, jwtRefreshExpire } = getJwtConfig();

  const accessMaxAge = ms(jwtExpire);
  const refreshMaxAge = ms(jwtRefreshExpire);

  res.cookie(accessCookieName, accessToken, getCookieOptions(accessMaxAge));
  res.cookie(refreshCookieName, refreshToken, getCookieOptions(refreshMaxAge));

  // Set the double-submit CSRF token alongside the auth cookies.  It is
  // intentionally NOT HttpOnly so the frontend JavaScript can read it.
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...getCookieOptions(Math.max(accessMaxAge, refreshMaxAge), /* httpOnly */ false),
    httpOnly: false,
  });
}

export function clearAuthCookies(res, admin = false) {
  const accessCookieName = admin ? ADMIN_ACCESS_COOKIE : USER_ACCESS_COOKIE;
  const refreshCookieName = admin ? ADMIN_REFRESH_COOKIE : USER_REFRESH_COOKIE;
  const expiredOptions = { ...getCookieOptions(0), maxAge: 0 };

  res.clearCookie(accessCookieName, expiredOptions);
  res.clearCookie(refreshCookieName, expiredOptions);
  res.clearCookie(CSRF_COOKIE, { ...expiredOptions, httpOnly: false });
}

export function getAccessTokenFromRequest(req, adminOnly = false) {
  const authorization = req.header('authorization');
  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  const cookies = getRequestCookies(req);
  if (adminOnly) {
    return cookies[ADMIN_ACCESS_COOKIE] || null;
  }

  return cookies[USER_ACCESS_COOKIE] || cookies[ADMIN_ACCESS_COOKIE] || null;
}

export function getRefreshTokenFromRequest(req, adminOnly = false) {
  if (req.body?.refreshToken) {
    return req.body.refreshToken;
  }

  const cookies = getRequestCookies(req);
  if (adminOnly) {
    return cookies[ADMIN_REFRESH_COOKIE] || null;
  }

  return cookies[USER_REFRESH_COOKIE] || cookies[ADMIN_REFRESH_COOKIE] || null;
}

export function getSocketAccessToken(socket) {
  const bearerToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.slice(7);
  if (bearerToken) {
    return bearerToken;
  }

  const cookies = parseCookieHeader(socket.handshake.headers?.cookie);
  return cookies[USER_ACCESS_COOKIE] || cookies[ADMIN_ACCESS_COOKIE] || null;
}

/** Sign a short-lived access token (15 min default) */
export function signToken(user, additionalClaims = {}) {
  const { jwtSecret, jwtExpire } = getJwtConfig();
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name, ...additionalClaims },
    jwtSecret,
    { expiresIn: jwtExpire }
  );
}

/** Sign a long-lived refresh token (7 days default) */
export function signRefreshToken(user, additionalClaims = {}) {
  const { jwtRefreshSecret, jwtRefreshExpire } = getJwtConfig();
  return jwt.sign(
    { id: user._id, ...additionalClaims },
    jwtRefreshSecret,
    { expiresIn: jwtRefreshExpire }
  );
}

/** Verify and decode an access token */
export function verifyAccessToken(token) {
  const { jwtSecret } = getJwtConfig();
  return jwt.verify(token, jwtSecret);
}

/** Verify and decode a refresh token */
export function verifyRefreshToken(token) {
  const { jwtRefreshSecret } = getJwtConfig();
  return jwt.verify(token, jwtRefreshSecret);
}

/** Hash a refresh token before storing in DB */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Express middleware – validates the Bearer access token */
export function verifyJWT(req, res, next) {
  const requestPath = req.path || '';
  const token = getAccessTokenFromRequest(
    req,
    requestPath.includes('/control/') || requestPath.includes('/pricing/') || requestPath.includes('/revenue/') || requestPath.includes('/auth/sessions')
  );

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    req.user = verifyAccessToken(token);
    if (req.user.role === 'admin' && normalizeEmail(req.user.email) !== getAdminEmail()) {
      return res.status(403).json({ error: 'Forbidden: invalid admin identity' });
    }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/** Strict role-based access control */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    if (req.user.role === 'admin' && normalizeEmail(req.user.email) !== getAdminEmail()) {
      return res.status(403).json({ error: 'Forbidden: invalid admin identity' });
    }
    next();
  };
}

export function requireAjayAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin' || normalizeEmail(req.user.email) !== getAdminEmail()) {
    return res.status(403).json({ error: 'Forbidden: admin access denied' });
  }
  return next();
}

function ms(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match) {
    return 15 * 60 * 1000;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] || 'ms').toLowerCase();
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

