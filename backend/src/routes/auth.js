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
import { sendPasswordResetEmail } from '../utils/emailService.js';
import {
  getPublicPasswordErrors,
  PUBLIC_PASSWORD_MAX_LENGTH,
  PUBLIC_PASSWORD_MIN_LENGTH,
  isBlockedAccountEmail,
  normalizeEmail,
} from '../utils/securityPolicy.js';
import {
  calculateLockUntil,
  incrementFailedAttempts,
  isTemporarilyLocked,
} from '../utils/accountSecurity.js';
import { requireRegistrationsEnabled } from '../middleware/platformControl.js';
import { Joi, validateBody } from '../middleware/validation.js';
import { registerFundAccount } from '../utils/razorpayClient.js';

const router = Router();
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
export const PUBLIC_ROLES = ['shipper', 'driver', 'broker'];

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_ROUTE_RATE_LIMIT_MAX || '30', 10),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

router.use(['/login', '/register', '/request-password-reset', '/reset-password'], authLimiter);

function ensureValidRequest(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return true;
  }

  const details = errors.array().map((entry) => entry.msg).filter(Boolean);
  const firstError = details[0] || 'Invalid request payload';
  res.status(400).json({ error: firstError, details });
  return false;
}

export const registerValidationRules = [
  body('email').isEmail().withMessage('Please enter a valid email address.').normalizeEmail(),
  body('password')
    .isString().withMessage('Password is required.')
    .isLength({ min: PUBLIC_PASSWORD_MIN_LENGTH, max: PUBLIC_PASSWORD_MAX_LENGTH })
    .withMessage(`Password must be between ${PUBLIC_PASSWORD_MIN_LENGTH} and ${PUBLIC_PASSWORD_MAX_LENGTH} characters.`)
    .bail()
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must include at least one special character.'),
  body('name')
    .isString().withMessage('Name is required.')
    .trim()
    .isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters.'),
  body('role')
    .isString().withMessage('Role is required.')
    .trim()
    .isIn(PUBLIC_ROLES).withMessage(`Role must be one of: ${PUBLIC_ROLES.join(', ')}.`),
  body('phone').optional({ values: 'falsy' }).isString().withMessage('Phone must be a string.').trim().isLength({ max: 30 }).withMessage('Phone must be 30 characters or fewer.'),
  body('gstin').optional({ values: 'falsy' }).isString().withMessage('GST ID must be a string.').trim().isLength({ max: 30 }).withMessage('GST ID must be 30 characters or fewer.'),
];

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

router.post('/register', [requireRegistrationsEnabled(), ...registerValidationRules], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const { password, name, role } = req.body;
    const phone = String(req.body.phone || '').trim() || undefined;
    const gstin = String(req.body.gstin || '').trim() || undefined;
    const email = normalizeEmail(req.body.email);

    if (isBlockedAccountEmail(email)) {
      return res.status(403).json({ error: 'This account is disabled by security policy' });
    }

    const passwordErrors = getPublicPasswordErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet length policy', details: passwordErrors });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = new User({
      email,
      password,
      name,
      role,
      phone,
      gstin,
      mfaEnabled: false,
      // Public signup is instant: no email/admin verification required.
      // Admins retain authority to suspend or delete fraudulent accounts
      // via /admin/control/users/:id (status PATCH or DELETE).
      isEmailVerified: true,
    });

    await user.save();

    // Auto-login the freshly registered user so they can use the platform
    // immediately without any additional verification step.
    const { accessToken, refreshToken } = issueTokensForUser(user);
    await user.save();
    setAuthCookies(res, { accessToken, refreshToken });

    return res.status(201).json({
      message: 'Registration successful. You are now signed in.',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isEmailVerified: true,
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

    // Public accounts are auto-verified at registration, so there is no
    // separate email-verification gate here any more. Admin login uses a
    // separate route with its own verification/MFA flow.

    user.failedLoginCount = 0;
    user.lockUntil = undefined;

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
    const passwordErrors = getPublicPasswordErrors(password);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: 'Password does not meet length policy', details: passwordErrors });
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

// ── KYC submission (user-side) ────────────────────────────────────────────────
// We do NOT integrate a paid Aadhaar/PAN verification vendor (Digio, Signzy
// etc. require GSP licensing/fees).  Users submit documents here and an
// admin approves/rejects via PATCH /admin/control/users/:id/kyc.  The
// existing admin endpoint already flips `kycStatus` which downstream flows
// (loadings, payouts) check.

// 350K chars ≈ 260 KB decoded — same bound as POD photos.
const MAX_KYC_FILE_LENGTH = 350_000;

const kycDocSchema = Joi.object({
  docType: Joi.string().valid('pan', 'aadhaar', 'driving_license', 'rc_book', 'gstin').required(),
  number: Joi.string().trim().min(4).max(40).required(),
  holderName: Joi.string().trim().min(2).max(120).required(),
  fileDataUrl: Joi.string()
    .pattern(/^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/)
    .max(MAX_KYC_FILE_LENGTH)
    .allow('')
    .optional(),
});

const kycSubmitSchema = Joi.object({
  documents: Joi.array().items(kycDocSchema).min(1).max(4).required(),
});

router.post('/kyc', verifyJWT, validateBody(kycSubmitSchema), async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts do not submit KYC' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Do NOT auto-approve; only admin can flip status to 'approved'.
    user.kycDocuments = req.body.documents.map((d) => ({
      docType: d.docType,
      number: d.number,
      holderName: d.holderName,
      fileDataUrl: d.fileDataUrl || '',
      submittedAt: new Date(),
    }));
    user.kycSubmittedAt = new Date();
    // Reset review-side fields so stale rejection reasons don't linger.
    user.kycRejectionReason = '';
    user.kycReviewedAt = null;
    // If the user was previously rejected, reopen to 'pending' state.
    if (user.kycStatus === 'rejected') user.kycStatus = 'pending';
    await user.save();
    return res.json({
      message: 'KYC documents submitted for review',
      kycStatus: user.kycStatus,
      kycSubmittedAt: user.kycSubmittedAt,
    });
  } catch (error) {
    console.error('KYC submit error:', error.message);
    return res.status(500).json({ error: 'Failed to submit KYC documents' });
  }
});

router.get('/kyc', verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('kycStatus kycDocuments kycSubmittedAt kycReviewedAt kycRejectionReason');
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Strip the heavy data URLs from the listing; users can re-download
    // individual documents if we ever add a per-doc GET.
    const documents = (user.kycDocuments || []).map((d) => ({
      docType: d.docType,
      number: d.number,
      holderName: d.holderName,
      hasFile: Boolean(d.fileDataUrl),
      submittedAt: d.submittedAt,
    }));
    return res.json({
      kycStatus: user.kycStatus,
      kycSubmittedAt: user.kycSubmittedAt,
      kycReviewedAt: user.kycReviewedAt,
      kycRejectionReason: user.kycRejectionReason,
      documents,
    });
  } catch (error) {
    console.error('KYC fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch KYC state' });
  }
});

// ── Fund account (payout destination) ─────────────────────────────────────────
// Drivers (and brokers) need to tell us where to send money when a shipper
// releases escrow.  We accept either UPI VPA or bank IFSC + account number,
// then attempt to register with RazorpayX (Contacts + Fund Account) when
// configured.  The RazorpayX IDs are cached on the user so subsequent
// payouts don't re-create.

const fundAccountSchema = Joi.object({
  method: Joi.string().valid('vpa', 'bank').required(),
  vpa: Joi.when('method', { is: 'vpa', then: Joi.string().trim().pattern(/^[\w.-]+@[\w.-]+$/).required(), otherwise: Joi.forbidden() }),
  accountNumber: Joi.when('method', { is: 'bank', then: Joi.string().trim().pattern(/^[0-9]{6,20}$/).required(), otherwise: Joi.forbidden() }),
  ifsc: Joi.when('method', { is: 'bank', then: Joi.string().trim().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required(), otherwise: Joi.forbidden() }),
  beneficiaryName: Joi.string().trim().min(2).max(120).required(),
});

router.post('/fund-account', verifyJWT, validateBody(fundAccountSchema), async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts do not register fund accounts' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const fundAccount = {
      method: req.body.method,
      vpa: req.body.vpa || '',
      accountNumber: req.body.accountNumber || '',
      ifsc: req.body.ifsc || '',
      beneficiaryName: req.body.beneficiaryName,
      updatedAt: new Date(),
      razorpayContactId: '',
      razorpayFundAccountId: '',
    };

    try {
      const result = await registerFundAccount({ user, fundAccount });
      if (result.configured) {
        fundAccount.razorpayContactId = result.razorpayContactId;
        fundAccount.razorpayFundAccountId = result.razorpayFundAccountId;
      }
    } catch (regErr) {
      // Non-fatal: persist locally even if RazorpayX rejects; driver can
      // fix and re-submit.  Log so ops can see which calls failed.
      console.error('RazorpayX fund account registration failed:', regErr.message);
    }

    user.fundAccount = fundAccount;
    await user.save();
    return res.json({
      message: 'Fund account saved',
      fundAccount: {
        method: user.fundAccount.method,
        vpa: user.fundAccount.vpa,
        accountLast4: user.fundAccount.accountNumber ? user.fundAccount.accountNumber.slice(-4) : '',
        ifsc: user.fundAccount.ifsc,
        beneficiaryName: user.fundAccount.beneficiaryName,
        registeredWithRazorpayX: Boolean(user.fundAccount.razorpayFundAccountId),
      },
    });
  } catch (error) {
    console.error('Fund account error:', error.message);
    return res.status(500).json({ error: 'Failed to save fund account' });
  }
});

router.get('/fund-account', verifyJWT, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('fundAccount');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.fundAccount) return res.json({ fundAccount: null });
    return res.json({
      fundAccount: {
        method: user.fundAccount.method,
        vpa: user.fundAccount.vpa,
        accountLast4: user.fundAccount.accountNumber ? user.fundAccount.accountNumber.slice(-4) : '',
        ifsc: user.fundAccount.ifsc,
        beneficiaryName: user.fundAccount.beneficiaryName,
        registeredWithRazorpayX: Boolean(user.fundAccount.razorpayFundAccountId),
      },
    });
  } catch (error) {
    console.error('Fund account fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch fund account' });
  }
});

export default router;

