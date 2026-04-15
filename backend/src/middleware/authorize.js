import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAdminEmail, normalizeEmail } from '../utils/securityPolicy.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '15m';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set');
}

/** Sign a short-lived access token (15 min default) */
export function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
}

/** Sign a long-lived refresh token (7 days default) */
export function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRE }
  );
}

/** Verify and decode an access token */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Verify and decode a refresh token */
export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
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

