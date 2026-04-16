import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAdminEmail, normalizeEmail } from '../utils/securityPolicy.js';

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
  const authorization = req.header('authorization');

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authorization.slice(7);
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

