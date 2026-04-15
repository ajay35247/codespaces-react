import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import User from '../schemas/UserSchema.js';
import AuditLog from '../schemas/AuditLogSchema.js';
import {
  verifyJWT,
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  requireAjayAdmin,
} from '../middleware/authorize.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendAdminMfaCodeEmail } from '../utils/emailService.js';
import {
  getAdminBootstrapPassword,
  getAdminEmail,
  getStrongPasswordErrors,
  isAjayAdmin,
  isBlockedAccountEmail,
  normalizeEmail,
} from '../utils/securityPolicy.js';
import {
  calculateLockUntil,
  generateMfaCode,
  incrementFailedAttempts,
  isTemporarilyLocked,
} from '../utils/accountSecurity.js';

const router = Router();
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const MFA_EXPIRY_MS = 5 * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

router.use(['/login', '/request-password-reset', '/refresh-token'], authLimiter);

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
  body('email').isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 12 }),
  body('name').isString().trim().isLength({ min: 2, max: 120 }),
  body('role').isString().isIn(['shipper', 'driver', 'fleet-manager', 'broker', 'admin']),
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

    if (role === 'admin' && email !== getAdminEmail()) {
      return res.status(403).json({ error: 'Only the configured admin identity can register as admin' });
    }
    if (role === 'admin' && password !== getAdminBootstrapPassword()) {
      return res.status(403).json({ error: 'Admin password must match the configured security policy' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = new User({
      email,
      password,
      name,
      role,
      phone,
      gstin,
      mfaEnabled: role === 'admin',
      verificationToken,
      isEmailVerified: role === 'admin',
    });

    await user.save();
    const { accessToken, refreshToken } = issueTokensForUser(user);
    await user.save();

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const verificationUrl = `${clientUrl}/verify-email/${verificationToken}`;

    if (role !== 'admin') {
      try {
        await sendVerificationEmail(user, verificationUrl);
      } catch (emailError) {
        console.warn('Failed to send verification email:', emailError.message);
      }
    }

    return res.status(201).json({
      token: accessToken,
      refreshToken,
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

    if (user.role === 'admin') {
      if (!isAjayAdmin(user.email, user.role)) {
        await user.save();
        return res.status(403).json({ error: 'Only Ajay is allowed to use the admin role' });
      }

      const mfaCode = generateMfaCode();
      const mfaChallengeToken = crypto.randomBytes(32).toString('hex');
      user.mfaEnabled = true;
      user.mfaCodeHash = hashToken(mfaCode);
      user.mfaCodeExpires = new Date(Date.now() + MFA_EXPIRY_MS);
      user.mfaChallengeHash = hashToken(mfaChallengeToken);
      user.mfaChallengeExpires = new Date(Date.now() + MFA_EXPIRY_MS);
      user.mfaAttemptCount = 0;
      await user.save();

      try {
        await sendAdminMfaCodeEmail(user, mfaCode);
      } catch (emailError) {
        console.warn('Failed to send admin MFA code:', emailError.message);
      }

      return res.status(202).json({
        mfaRequired: true,
        mfaChallengeToken,
        email: user.email,
        expiresInSeconds: Math.floor(MFA_EXPIRY_MS / 1000),
      });
    }

    const { accessToken, refreshToken } = issueTokensForUser(user);
    await user.save();

    return res.json({
      token: accessToken,
      refreshToken,
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

router.post('/login/mfa-verify', [
  body('email').isEmail().normalizeEmail(),
  body('mfaChallengeToken').isString().isLength({ min: 32, max: 128 }),
  body('mfaCode').matches(/^\d{6}$/),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);
    const { mfaChallengeToken, mfaCode } = req.body;

    const user = await User.findOne({ email, role: 'admin' });
    if (!user || !isAjayAdmin(user.email, user.role)) {
      return res.status(403).json({ error: 'Admin identity is not allowed' });
    }

    if (isTemporarilyLocked(user.lockUntil)) {
      return res.status(423).json({ error: 'Account temporarily locked due to failed login attempts' });
    }

    const isChallengeValid = user.mfaChallengeHash
      && user.mfaChallengeExpires
      && user.mfaChallengeExpires.getTime() > Date.now()
      && user.mfaChallengeHash === hashToken(mfaChallengeToken);

    const isCodeValid = user.mfaCodeHash
      && user.mfaCodeExpires
      && user.mfaCodeExpires.getTime() > Date.now()
      && user.mfaCodeHash === hashToken(mfaCode);

    if (!isChallengeValid || !isCodeValid) {
      const next = incrementFailedAttempts(user.mfaAttemptCount, LOGIN_MAX_FAILED_ATTEMPTS);
      user.mfaAttemptCount = next.nextCount;
      if (next.shouldLock) {
        user.lockUntil = calculateLockUntil(LOGIN_LOCK_WINDOW_MS);
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid MFA code or challenge token' });
    }

    user.mfaAttemptCount = 0;
    user.mfaCodeHash = undefined;
    user.mfaCodeExpires = undefined;
    user.mfaChallengeHash = undefined;
    user.mfaChallengeExpires = undefined;

    const { accessToken, refreshToken } = issueTokensForUser(user);
    await user.save();

    return res.json({
      token: accessToken,
      refreshToken,
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
    const { refreshToken } = req.body;
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

    return res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Refresh token error:', error.message);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

/** Logout – revoke the presented refresh token */
router.post('/logout', verifyJWT, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      await User.updateOne({ _id: req.user.id }, { $pull: { refreshTokens: hashed } });
    }
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

    if (isAjayAdmin(user.email, user.role) && password !== getAdminBootstrapPassword()) {
      return res.status(403).json({ error: 'Admin password must match the configured security policy' });
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

router.get('/admin/audit-logs', verifyJWT, requireAjayAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);
    const logs = await AuditLog.find({}).sort({ createdAt: -1 }).limit(limit);
    return res.json({ logs });
  } catch (error) {
    console.error('Audit log fetch error:', error.message);
    return res.status(500).json({ error: 'Unable to fetch audit logs' });
  }
});

router.get('/admin/security-events', verifyJWT, requireAjayAdmin, async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [failedLogins, failedMfa, lockouts] = await Promise.all([
      AuditLog.countDocuments({ path: '/login', statusCode: { $in: [401, 403, 423] }, createdAt: { $gte: since } }),
      AuditLog.countDocuments({ path: '/login/mfa-verify', statusCode: { $in: [401, 423] }, createdAt: { $gte: since } }),
      AuditLog.countDocuments({ statusCode: 423, createdAt: { $gte: since } }),
    ]);

    const topSourceIps = await AuditLog.aggregate([
      {
        $match: {
          statusCode: { $in: [401, 403, 423] },
          path: { $in: ['/login', '/login/mfa-verify'] },
          createdAt: { $gte: since },
        },
      },
      { $group: { _id: '$ipAddress', attempts: { $sum: 1 } } },
      { $sort: { attempts: -1 } },
      { $limit: 10 },
    ]);

    return res.json({
      window: '24h',
      failedLogins,
      failedMfa,
      lockouts,
      topSourceIps,
    });
  } catch (error) {
    console.error('Security events fetch error:', error.message);
    return res.status(500).json({ error: 'Unable to fetch security events' });
  }
});

export default router;

