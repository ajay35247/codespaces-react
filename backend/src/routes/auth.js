import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import User from '../schemas/UserSchema.js';
import {
  clearAuthCookies,
  getRefreshTokenFromRequest,
  setAuthCookies,
  verifyJWT,
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../middleware/authorize.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailService.js';
import {
  getStrongPasswordErrors,
  isBlockedAccountEmail,
  normalizeEmail,
} from '../utils/securityPolicy.js';
import {
  calculateLockUntil,
  incrementFailedAttempts,
  isTemporarilyLocked,
} from '../utils/accountSecurity.js';
import { requireRegistrationsEnabled } from '../middleware/platformControl.js';

const router = Router();
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_ROLES = ['shipper', 'driver', 'fleet-manager', 'broker'];

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_ROUTE_RATE_LIMIT_MAX || '30', 10),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

router.use(['/login', '/register', '/request-password-reset', '/refresh-token', '/reset-password'], authLimiter);

function ensureValidRequest(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return true;
  }
  res.status(400).json({ error: 'Invalid request payload', details: errors.array() });
  return false;
}

async function recordFailedLogin(user) {
  if (!user) return;

  const next = incrementFailedAttempts(user.failedLoginCount, LOGIN_MAX_FAILED_ATTEMPTS);
  user.failedLoginCount = next.nextCount;
  if (next.shouldLock) {
    user.lockUntil = calculateLockUntil(LOGIN_LOCK_WINDOW_MS);
  }
  await user.save();
}

function issueTokensForUser(user) {
  const accessToken = signToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshTokens.push(hashToken(refreshToken));
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }
  return { accessToken, refreshToken };
}

router.post('/register', [
  requireRegistrationsEnabled(),
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 12 }),
  body('name').isString().trim().isLength({ min: 2, max: 120 }),
  body('role').isString().isIn(PUBLIC_ROLES),
  body('phone').optional().isString().trim().isLength({ max: 30 }),
  body('gstin').optional().isString().trim().isLength({ max: 30 }),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const { password, name, role, phone, gstin } = req.body;
    const email = normalizeEmail(req.body.email);

    if (isBlockedAccountEmail(email)) {
      return res.status(403).json({ error: 'This account is disabled by security policy' });
    }

    const passwordErrors = getStrongPasswordErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet complexity policy', details: passwordErrors });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const isDev = process.env.NODE_ENV === 'development';
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = new User({
      email,
      password,
      name,
      role,
      phone,
      gstin,
      mfaEnabled: false,
      verificationToken,
      isEmailVerified: isDev,
    });

    await user.save();

    if (isDev) {
      return res.status(201).json({
        message: 'Registration successful. You can now login.',
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isEmailVerified: true,
        },
      });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verificationUrl = `${clientUrl}/verify-email/${verificationToken}`;

    try {
      await sendVerificationEmail(user, verificationUrl);
    } catch (emailError) {
      console.warn('Failed to send verification email:', emailError.message);
    }

    return res.status(201).json({
      message: 'Registration successful. Verify your email address before signing in.',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 200 }),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    if (isBlockedAccountEmail(email)) {
      return res.status(403).json({ error: 'This account is disabled by security policy' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.role === 'admin') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.accountStatus && user.accountStatus !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    if (isTemporarilyLocked(user.lockUntil)) {
      return res.status(423).json({ error: 'Account temporarily locked due to failed login attempts' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await recordFailedLogin(user);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.failedLoginCount = 0;
    user.lockUntil = undefined;

    if (!user.isEmailVerified) {
      await user.save();
      return res.status(403).json({ error: 'Please verify your email address first' });
    }

    const { accessToken, refreshToken } = issueTokensForUser(user);
    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/** Rotate access token using a valid refresh token */
router.post('/refresh-token', async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const hashed = hashToken(refreshToken);
    const user = await User.findOne({ _id: decoded.id, refreshTokens: hashed });
    if (!user) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    // Rotate: remove old, issue new
    user.refreshTokens = user.refreshTokens.filter((t) => t !== hashed);
    const newAccessToken = signToken(user);
    const newRefreshToken = signRefreshToken(user);
    user.refreshTokens.push(hashToken(newRefreshToken));
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }
    await user.save();

    setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken });

    return res.json({ success: true });
  } catch (error) {
    console.error('Refresh token error:', error.message);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

/** Logout – revoke the presented refresh token */
router.post('/logout', verifyJWT, async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      await User.updateOne({ _id: req.user.id }, { $pull: { refreshTokens: hashed } });
    }
    clearAuthCookies(res);
    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error.message);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

router.post('/request-password-reset', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);

    const user = await User.findOne({ email });
    // Always return 200 to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email is registered you will receive a reset link.' });
    }

    user.resetToken = crypto.randomBytes(32).toString('hex');
    user.resetTokenExpires = Date.now() + 3600000;
    await user.save();
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password?token=${user.resetToken}`;

    try {
      await sendPasswordResetEmail(user, resetUrl);
    } catch (emailError) {
      console.warn('Failed to send password reset email:', emailError.message);
    }

    return res.json({ message: 'If that email is registered you will receive a reset link.' });
  } catch (error) {
    console.error('Password reset request error:', error.message);
    return res.status(500).json({ error: 'Password reset request failed' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    const passwordErrors = getStrongPasswordErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet complexity policy', details: passwordErrors });
    }

    const user = await User.findOne({ resetToken: token, resetTokenExpires: { $gt: Date.now() } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    user.refreshTokens = []; // invalidate all sessions on password reset
    await user.save();

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error.message);
    return res.status(500).json({ error: 'Password reset failed' });
  }
});

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    user.isEmailVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (error) {
    console.error('Email verification error:', error.message);
    return res.status(500).json({ error: 'Email verification failed' });
  }
});

router.get('/me', verifyJWT, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = await User.findById(req.user.id).select('-password -refreshTokens');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user });
  } catch (error) {
    console.error('Auth check error:', error.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
});

export default router;

