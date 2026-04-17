import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdminBootstrapPassword,
  getAdminEmail,
  getStrongPasswordErrors,
  isAjayAdmin,
  isBlockedAccountEmail,
  isStrongPassword,
  normalizeEmail,
} from '../../src/utils/securityPolicy.js';
import {
  calculateLockUntil,
  generateMfaCode,
  incrementFailedAttempts,
  isTemporarilyLocked,
  isValidMfaChallengeToken,
  isValidMfaCode,
} from '../../src/utils/accountSecurity.js';
import { sanitizeBody } from '../../src/middleware/auditLogger.js';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';

const authorize = await import('../../src/middleware/authorize.js');
const {
  getAccessTokenFromRequest,
  hashToken,
  parseCookieHeader,
  requireAjayAdmin,
  requireRole,
  signToken,
  signRefreshToken,
  verifyAccessToken,
  verifyJWT,
  verifyRefreshToken,
} = authorize;
const { enforceTrustedOriginForCookieAuth } = await import('../../src/middleware/csrfProtection.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    header() {
      return undefined;
    },
  };
}

// Layer 1: Identity normalization and admin profile restrictions

test('L1.1 normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  Ajay35247@GMAIL.COM  '), 'ajay35247@gmail.com');
});

test('L1.2 admin email is fixed to Ajay identity by default', () => {
  assert.equal(getAdminEmail(), 'ajay35247@gmail.com');
});

test('L1.3 isAjayAdmin accepts Ajay admin role', () => {
  assert.equal(isAjayAdmin('ajay35247@gmail.com', 'admin'), true);
});

test('L1.4 isAjayAdmin rejects non-admin role', () => {
  assert.equal(isAjayAdmin('ajay35247@gmail.com', 'broker'), false);
});

test('L1.5 isAjayAdmin rejects non-Ajay email', () => {
  assert.equal(isAjayAdmin('other@example.com', 'admin'), false);
});

// Layer 2: Strong password policy

test('L2.1 strong password passes policy', () => {
  assert.equal(isStrongPassword('Sharma@76210A'), true);
});

test('L2.2 short password fails policy', () => {
  const errors = getStrongPasswordErrors('Aa1!short');
  assert.ok(errors.some((e) => e.includes('at least 12 characters')));
});

test('L2.3 password missing uppercase fails policy', () => {
  const errors = getStrongPasswordErrors('sharma@76210ab');
  assert.ok(errors.some((e) => e.includes('uppercase')));
});

test('L2.4 password missing number fails policy', () => {
  const errors = getStrongPasswordErrors('Sharma@OnlyChars');
  assert.ok(errors.some((e) => e.includes('number')));
});

test('L2.5 password missing special char fails policy', () => {
  const errors = getStrongPasswordErrors('Sharma76210AA');
  assert.ok(errors.some((e) => e.includes('special character')));
});

// Layer 3: Blocked/default account controls

test('L3.1 guest account email is blocked', () => {
  assert.equal(isBlockedAccountEmail('guest@aptrucking.in'), true);
});

test('L3.2 demo account email is blocked', () => {
  assert.equal(isBlockedAccountEmail('demo@aptrucking.in'), true);
});

test('L3.3 normal business account is not blocked', () => {
  assert.equal(isBlockedAccountEmail('ops@company.com'), false);
});

test('L3.4 blocked checks are case-insensitive', () => {
  assert.equal(isBlockedAccountEmail('GUEST@APTRUCKING.IN'), true);
});

test('L3.5 admin bootstrap password is configured', () => {
  assert.equal(getAdminBootstrapPassword(), 'Sharma@76210');
});

// Layer 4: Account lockout logic

test('L4.1 first failed attempt increments counter', () => {
  const result = incrementFailedAttempts(0, 5);
  assert.deepEqual(result, { shouldLock: false, nextCount: 1 });
});

test('L4.2 fifth failed attempt locks account', () => {
  const result = incrementFailedAttempts(4, 5);
  assert.deepEqual(result, { shouldLock: true, nextCount: 0 });
});

test('L4.3 lock timestamp is in the future', () => {
  const now = Date.now();
  const lockUntil = calculateLockUntil(60000, now);
  assert.equal(lockUntil.getTime(), now + 60000);
});

test('L4.4 lock check returns true for active lock', () => {
  const lockUntil = new Date(Date.now() + 10000);
  assert.equal(isTemporarilyLocked(lockUntil), true);
});

test('L4.5 lock check returns false for expired lock', () => {
  const lockUntil = new Date(Date.now() - 10000);
  assert.equal(isTemporarilyLocked(lockUntil), false);
});

// Layer 5: MFA primitives

test('L5.1 generated MFA code has 6 digits', () => {
  const code = generateMfaCode();
  assert.equal(/^[0-9]{6}$/.test(code), true);
});

test('L5.2 valid MFA code passes check', () => {
  assert.equal(isValidMfaCode('123456'), true);
});

test('L5.3 short MFA code fails check', () => {
  assert.equal(isValidMfaCode('12345'), false);
});

test('L5.4 valid MFA challenge token passes check', () => {
  assert.equal(isValidMfaChallengeToken('a'.repeat(64)), true);
});

test('L5.5 invalid MFA challenge token fails check', () => {
  assert.equal(isValidMfaChallengeToken('xyz'), false);
});

// Layer 6: JWT and token cryptography

test('L6.1 hashToken is deterministic', () => {
  assert.equal(hashToken('sample-token'), hashToken('sample-token'));
});

test('L6.2 hashToken differs for different tokens', () => {
  assert.notEqual(hashToken('token-a'), hashToken('token-b'));
});

test('L6.3 access token signs and verifies payload', () => {
  const token = signToken({ _id: 'u1', email: 'u1@example.com', role: 'shipper', name: 'User One' });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.email, 'u1@example.com');
});

test('L6.4 refresh token signs and verifies payload', () => {
  const token = signRefreshToken({ _id: 'u2' });
  const decoded = verifyRefreshToken(token);
  assert.equal(decoded.id, 'u2');
});

test('L6.5 invalid access token throws', () => {
  assert.throws(() => verifyAccessToken('invalid.jwt.token'));
});

// Layer 7: verifyJWT middleware behavior

test('L7.1 verifyJWT rejects missing bearer token', () => {
  const req = { header: () => null };
  const res = createRes();
  verifyJWT(req, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('L7.2 verifyJWT rejects malformed token header', () => {
  const req = { header: () => 'Token abc' };
  const res = createRes();
  verifyJWT(req, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('L7.3 verifyJWT accepts valid non-admin token', () => {
  const token = signToken({ _id: 'u3', email: 'u3@example.com', role: 'broker', name: 'U3' });
  const req = { header: () => `Bearer ${token}` };
  const res = createRes();
  let nextCalled = false;
  verifyJWT(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('L7.4 verifyJWT rejects admin token with wrong email', () => {
  const token = signToken({ _id: 'u4', email: 'admin@other.com', role: 'admin', name: 'Wrong Admin' });
  const req = { header: () => `Bearer ${token}` };
  const res = createRes();
  verifyJWT(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L7.5 verifyJWT accepts Ajay admin token', () => {
  const token = signToken({ _id: 'u5', email: 'ajay35247@gmail.com', role: 'admin', name: 'Ajay' });
  const req = { header: () => `Bearer ${token}` };
  const res = createRes();
  let nextCalled = false;
  verifyJWT(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// Layer 8: Role-based middleware enforcement

test('L8.1 requireRole rejects unauthenticated request', () => {
  const middleware = requireRole(['admin']);
  const req = {};
  const res = createRes();
  middleware(req, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('L8.2 requireRole rejects disallowed role', () => {
  const middleware = requireRole(['admin']);
  const req = { user: { role: 'driver', email: 'driver@example.com' } };
  const res = createRes();
  middleware(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L8.3 requireRole accepts allowed non-admin role', () => {
  const middleware = requireRole(['driver']);
  const req = { user: { role: 'driver', email: 'driver@example.com' } };
  const res = createRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('L8.4 requireRole rejects invalid admin identity', () => {
  const middleware = requireRole(['admin']);
  const req = { user: { role: 'admin', email: 'bad-admin@example.com' } };
  const res = createRes();
  middleware(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L8.5 requireRole accepts Ajay admin identity', () => {
  const middleware = requireRole(['admin']);
  const req = { user: { role: 'admin', email: 'ajay35247@gmail.com' } };
  const res = createRes();
  let nextCalled = false;
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// Layer 9: Strict Ajay-only admin middleware

test('L9.1 requireAjayAdmin rejects missing user', () => {
  const req = {};
  const res = createRes();
  requireAjayAdmin(req, res, () => {});
  assert.equal(res.statusCode, 401);
});

test('L9.2 requireAjayAdmin rejects non-admin role', () => {
  const req = { user: { role: 'broker', email: 'ajay35247@gmail.com' } };
  const res = createRes();
  requireAjayAdmin(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L9.3 requireAjayAdmin rejects wrong admin email', () => {
  const req = { user: { role: 'admin', email: 'other@example.com' } };
  const res = createRes();
  requireAjayAdmin(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L9.4 requireAjayAdmin accepts Ajay admin', () => {
  const req = { user: { role: 'admin', email: 'ajay35247@gmail.com' } };
  const res = createRes();
  let nextCalled = false;
  requireAjayAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('L9.5 requireAjayAdmin accepts case-variant Ajay email', () => {
  const req = { user: { role: 'admin', email: 'AJAY35247@GMAIL.COM' } };
  const res = createRes();
  let nextCalled = false;
  requireAjayAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// Layer 10: Audit logging sanitization

test('L10.1 sanitizeBody redacts password', () => {
  const safe = sanitizeBody({ password: 'secret' });
  assert.equal(safe.password, '[REDACTED]');
});

test('L10.2 sanitizeBody redacts refresh token', () => {
  const safe = sanitizeBody({ refreshToken: 'r1' });
  assert.equal(safe.refreshToken, '[REDACTED]');
});

test('L10.3 sanitizeBody redacts MFA code', () => {
  const safe = sanitizeBody({ mfaCode: '123456' });
  assert.equal(safe.mfaCode, '[REDACTED]');
});

test('L10.4 sanitizeBody redacts challenge token', () => {
  const safe = sanitizeBody({ mfaChallengeToken: 'abc' });
  assert.equal(safe.mfaChallengeToken, '[REDACTED]');
});

test('L10.5 sanitizeBody preserves non-sensitive fields', () => {
  const safe = sanitizeBody({ action: 'UPDATE_SETTINGS', path: '/api/auth/me' });
  assert.equal(safe.action, 'UPDATE_SETTINGS');
  assert.equal(safe.path, '/api/auth/me');
});

// Layer 11: Cookie-backed auth and CSRF-style origin enforcement

test('L11.1 parseCookieHeader reads auth cookies', () => {
  const cookies = parseCookieHeader('st_access=abc123; st_refresh=ref456');
  assert.equal(cookies.st_access, 'abc123');
  assert.equal(cookies.st_refresh, 'ref456');
});

test('L11.2 getAccessTokenFromRequest falls back to auth cookie', () => {
  const req = {
    header: () => null,
    headers: { cookie: 'st_access=cookie-token' },
  };
  assert.equal(getAccessTokenFromRequest(req), 'cookie-token');
});

test('L11.3 cookie-authenticated mutation rejects invalid origin', () => {
  process.env.FRONTEND_URL = 'https://www.aptrucking.in';
  process.env.CLIENT_URL = 'https://www.aptrucking.in';

  const req = {
    method: 'POST',
    cookies: { st_access: 'cookie-token' },
    get(header) {
      if (header === 'origin') return 'https://evil.example';
      if (header === 'authorization') return undefined;
      return undefined;
    },
    headers: {},
  };
  const res = createRes();

  enforceTrustedOriginForCookieAuth(req, res, () => {});
  assert.equal(res.statusCode, 403);
});

test('L11.4 cookie-authenticated mutation accepts trusted origin', () => {
  process.env.FRONTEND_URL = 'https://www.aptrucking.in';
  process.env.CLIENT_URL = 'https://www.aptrucking.in';

  const req = {
    method: 'POST',
    cookies: { st_access: 'cookie-token' },
    get(header) {
      if (header === 'origin') return 'https://www.aptrucking.in';
      if (header === 'authorization') return undefined;
      return undefined;
    },
    headers: {},
  };
  let nextCalled = false;

  enforceTrustedOriginForCookieAuth(req, createRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('L11.5 bearer-authenticated mutation is not blocked by origin middleware', () => {
  const req = {
    method: 'POST',
    cookies: { st_access: 'cookie-token' },
    get(header) {
      if (header === 'authorization') return 'Bearer abc';
      return undefined;
    },
    headers: {},
  };
  let nextCalled = false;

  enforceTrustedOriginForCookieAuth(req, createRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
