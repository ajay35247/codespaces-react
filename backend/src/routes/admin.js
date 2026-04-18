import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import User from '../schemas/UserSchema.js';
import Load from '../schemas/LoadSchema.js';
import Payment from '../schemas/PaymentSchema.js';
import AuditLog from '../schemas/AuditLogSchema.js';
import AdminSession from '../schemas/AdminSessionSchema.js';
import AdminControlState from '../schemas/AdminControlStateSchema.js';
import SubscriptionPlan from '../schemas/SubscriptionPlanSchema.js';
import LedgerEntry from '../schemas/LedgerEntrySchema.js';
import FraudEvent from '../schemas/FraudEventSchema.js';
import AutomationRule from '../schemas/AutomationRuleSchema.js';
import AiDecisionLog from '../schemas/AiDecisionLogSchema.js';
import GstInvoice from '../schemas/GstInvoiceSchema.js';
import SupportTicket from '../schemas/SupportTicketSchema.js';
import {
  clearAuthCookies,
  getRefreshTokenFromRequest,
  setAuthCookies,
  verifyJWT,
  signToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  requireAjayAdmin,
} from '../middleware/authorize.js';
import { sendAdminMfaCodeEmail } from '../utils/emailService.js';
import { getAdminEmail, normalizeEmail } from '../utils/securityPolicy.js';
import {
  calculateLockUntil,
  generateMfaCode,
  incrementFailedAttempts,
  isTemporarilyLocked,
} from '../utils/accountSecurity.js';
import { requireAdminIpWhitelist } from '../middleware/adminSecurity.js';
import { getDeviceId, getRequestIp } from '../utils/requestIdentity.js';

const router = Router();
const LOGIN_MAX_FAILED_ATTEMPTS = 5;
const LOGIN_LOCK_WINDOW_MS = 15 * 60 * 1000;
const MFA_EXPIRY_MS = 5 * 60 * 1000;
const MFA_RESEND_MIN_INTERVAL_MS = 30 * 1000;
const MAX_MFA_RESEND_ATTEMPTS = 3;

const adminAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin auth requests' },
});

function ensureValidRequest(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return true;

  const details = errors.array().map((entry) => entry.msg).filter(Boolean);
  const firstError = details[0] || 'Invalid request payload';
  res.status(400).json({ error: firstError, details });
  return false;
}

async function logAdminAuthEvent(req, user, action, statusCode, metadata = {}) {
  try {
    await AuditLog.create({
      userId: user?._id,
      userEmail: user?.email,
      userRole: user?.role,
      action,
      resource: 'admin-auth',
      ipAddress: getRequestIp(req),
      userAgent: req.get('user-agent'),
      method: req.method,
      path: req.path,
      statusCode,
      metadata,
    });
  } catch (error) {
    console.warn('Admin auth audit log failed:', error.message);
  }
}

router.post('/auth/login', adminAuthLimiter, requireAdminIpWhitelist, [
  body('email').isEmail().withMessage('Please enter a valid admin email.').normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 200 }).withMessage('Password is required.'),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);
    const { password } = req.body;

    const user = await User.findOne({ email, role: 'admin' });
    if (!user || normalizeEmail(user.email) !== getAdminEmail()) {
      await logAdminAuthEvent(req, null, 'ADMIN_LOGIN_FAILED', 401, { reason: 'identity' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.accountStatus && user.accountStatus !== 'active') {
      await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_BLOCKED_STATUS', 403, { status: user.accountStatus });
      return res.status(403).json({ error: 'Account is not active' });
    }

    if (isTemporarilyLocked(user.lockUntil)) {
      await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_BLOCKED_LOCKED', 423);
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      const next = incrementFailedAttempts(user.failedLoginCount, LOGIN_MAX_FAILED_ATTEMPTS);
      user.failedLoginCount = next.nextCount;
      if (next.shouldLock) {
        user.lockUntil = calculateLockUntil(LOGIN_LOCK_WINDOW_MS);
      }
      await user.save();
      await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_FAILED', 401, { reason: 'password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    user.mfaEnabled = true;

    const mfaCode = generateMfaCode();
    const mfaChallengeToken = crypto.randomBytes(32).toString('hex');
    user.mfaCodeHash = hashToken(mfaCode);
    user.mfaCodeExpires = new Date(Date.now() + MFA_EXPIRY_MS);
    user.mfaChallengeHash = hashToken(mfaChallengeToken);
    user.mfaChallengeExpires = new Date(Date.now() + MFA_EXPIRY_MS);
    user.mfaAttemptCount = 0;
    user.mfaResendCount = 0;
    user.mfaLastSentAt = new Date();
    await user.save();

    try {
      await sendAdminMfaCodeEmail(user, mfaCode);
    } catch (error) {
      user.mfaCodeHash = undefined;
      user.mfaCodeExpires = undefined;
      user.mfaChallengeHash = undefined;
      user.mfaChallengeExpires = undefined;
      user.mfaAttemptCount = 0;
      user.mfaResendCount = 0;
      user.mfaLastSentAt = undefined;
      await user.save();
      await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_MFA_SEND_FAILED', 503, { reason: 'email-delivery' });
      return res.status(503).json({ error: 'Unable to send MFA code. Please try again.' });
    }

    await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_MFA_CHALLENGE', 202);

    return res.status(202).json({
      mfaRequired: true,
      mfaChallengeToken,
      email: user.email,
      expiresInSeconds: Math.floor(MFA_EXPIRY_MS / 1000),
    });
  } catch (error) {
    console.error('Admin login error:', error.message);
    return res.status(500).json({ error: 'Admin login failed' });
  }
});

router.post('/auth/login/mfa-verify', adminAuthLimiter, requireAdminIpWhitelist, [
  body('email').isEmail().withMessage('Please enter a valid admin email.').normalizeEmail(),
  body('mfaChallengeToken').isString().isLength({ min: 32, max: 128 }).withMessage('Invalid challenge token.'),
  body('mfaCode').matches(/^\d{6}$/).withMessage('MFA code must be a 6-digit number.'),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);
    const { mfaChallengeToken, mfaCode } = req.body;

    const user = await User.findOne({ email, role: 'admin' });
    if (!user || normalizeEmail(user.email) !== getAdminEmail()) {
      await logAdminAuthEvent(req, null, 'ADMIN_MFA_FAILED', 403, { reason: 'identity' });
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    if (isTemporarilyLocked(user.lockUntil)) {
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_BLOCKED_LOCKED', 423);
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const challengeOk = user.mfaChallengeHash
      && user.mfaChallengeExpires
      && user.mfaChallengeExpires.getTime() > Date.now()
      && user.mfaChallengeHash === hashToken(mfaChallengeToken);

    const codeOk = user.mfaCodeHash
      && user.mfaCodeExpires
      && user.mfaCodeExpires.getTime() > Date.now()
      && user.mfaCodeHash === hashToken(mfaCode);

    if (!challengeOk || !codeOk) {
      const next = incrementFailedAttempts(user.mfaAttemptCount, LOGIN_MAX_FAILED_ATTEMPTS);
      user.mfaAttemptCount = next.nextCount;
      if (next.shouldLock) {
        user.lockUntil = calculateLockUntil(LOGIN_LOCK_WINDOW_MS);
      }
      await user.save();
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_FAILED', 401);
      return res.status(401).json({ error: 'Invalid MFA challenge' });
    }

    const sessionId = crypto.randomUUID();
    const refreshToken = signRefreshToken(user, { sessionId });
    const accessToken = signToken(user, { sessionId, adminScope: 'control-tower' });
    const refreshTokenHash = hashToken(refreshToken);
    user.refreshTokens.push(refreshTokenHash);
    user.refreshTokens = user.refreshTokens.slice(-10);
    user.mfaAttemptCount = 0;
    user.mfaCodeHash = undefined;
    user.mfaCodeExpires = undefined;
    user.mfaChallengeHash = undefined;
    user.mfaChallengeExpires = undefined;
    user.mfaResendCount = 0;
    user.mfaLastSentAt = undefined;
    await user.save();

    await AdminSession.create({
      adminUserId: user._id,
      sessionId,
      refreshTokenHash,
      ipAddress: getRequestIp(req),
      userAgent: req.get('user-agent'),
      deviceId: getDeviceId(req),
      loginAt: new Date(),
      lastSeenAt: new Date(),
    });

    await logAdminAuthEvent(req, user, 'ADMIN_LOGIN_SUCCESS', 200, { sessionId });

    setAuthCookies(res, { accessToken, refreshToken, admin: true });

    return res.json({
      admin: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Admin MFA verify error:', error.message);
    return res.status(500).json({ error: 'Admin MFA verification failed' });
  }
});

router.post('/auth/login/mfa-resend', adminAuthLimiter, requireAdminIpWhitelist, [
  body('email').isEmail().withMessage('Please enter a valid admin email.').normalizeEmail(),
  body('mfaChallengeToken').isString().isLength({ min: 32, max: 128 }).withMessage('Invalid challenge token.'),
], async (req, res) => {
  try {
    if (!ensureValidRequest(req, res)) return;
    const email = normalizeEmail(req.body.email);
    const { mfaChallengeToken } = req.body;

    const user = await User.findOne({ email, role: 'admin' });
    if (!user || normalizeEmail(user.email) !== getAdminEmail()) {
      await logAdminAuthEvent(req, null, 'ADMIN_MFA_RESEND_FAILED', 403, { reason: 'identity' });
      return res.status(403).json({ error: 'Invalid credentials' });
    }

    if (isTemporarilyLocked(user.lockUntil)) {
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_RESEND_BLOCKED_LOCKED', 423);
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const challengeOk = user.mfaChallengeHash
      && user.mfaChallengeExpires
      && user.mfaChallengeExpires.getTime() > Date.now()
      && user.mfaChallengeHash === hashToken(mfaChallengeToken);

    if (!challengeOk) {
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_RESEND_FAILED', 401, { reason: 'challenge' });
      return res.status(401).json({ error: 'MFA challenge expired. Please login again.' });
    }

    if (user.mfaResendCount >= MAX_MFA_RESEND_ATTEMPTS) {
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_RESEND_BLOCKED_LIMIT', 429);
      return res.status(429).json({ error: 'MFA resend limit reached. Please login again.' });
    }

    if (user.mfaLastSentAt && Date.now() - user.mfaLastSentAt.getTime() < MFA_RESEND_MIN_INTERVAL_MS) {
      return res.status(429).json({ error: 'Please wait before requesting another MFA code.' });
    }

    const mfaCode = generateMfaCode();
    user.mfaCodeHash = hashToken(mfaCode);
    user.mfaCodeExpires = new Date(Date.now() + MFA_EXPIRY_MS);
    user.mfaResendCount = Number(user.mfaResendCount || 0) + 1;
    user.mfaLastSentAt = new Date();
    await user.save();

    try {
      await sendAdminMfaCodeEmail(user, mfaCode);
    } catch (error) {
      await logAdminAuthEvent(req, user, 'ADMIN_MFA_RESEND_FAILED', 503, { reason: 'email-delivery' });
      return res.status(503).json({ error: 'Unable to resend MFA code. Please login again.' });
    }

    await logAdminAuthEvent(req, user, 'ADMIN_MFA_RESEND_SUCCESS', 200);

    return res.json({
      message: 'MFA code resent successfully',
      expiresInSeconds: Math.floor(MFA_EXPIRY_MS / 1000),
    });
  } catch (error) {
    console.error('Admin MFA resend error:', error.message);
    return res.status(500).json({ error: 'Admin MFA resend failed' });
  }
});

router.post('/auth/refresh-token', requireAdminIpWhitelist, async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req, true);
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const refreshTokenHash = hashToken(refreshToken);
    const user = await User.findOne({ _id: decoded.id, role: 'admin', refreshTokens: refreshTokenHash });
    if (!user || normalizeEmail(user.email) !== getAdminEmail()) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    const session = await AdminSession.findOne({
      adminUserId: user._id,
      sessionId: decoded.sessionId,
      refreshTokenHash,
      revokedAt: { $exists: false },
    });
    if (!session) {
      return res.status(401).json({ error: 'Session revoked' });
    }

    const newRefreshToken = signRefreshToken(user, { sessionId: session.sessionId });
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const newAccessToken = signToken(user, { sessionId: session.sessionId, adminScope: 'control-tower' });

    user.refreshTokens = user.refreshTokens.filter((tokenHash) => tokenHash !== refreshTokenHash);
    user.refreshTokens.push(newRefreshTokenHash);
    user.refreshTokens = user.refreshTokens.slice(-10);
    await user.save();

    session.refreshTokenHash = newRefreshTokenHash;
    session.lastSeenAt = new Date();
    await session.save();

    setAuthCookies(res, { accessToken: newAccessToken, refreshToken: newRefreshToken, admin: true });

    return res.json({ success: true });
  } catch (error) {
    console.error('Admin refresh error:', error.message);
    return res.status(500).json({ error: 'Refresh failed' });
  }
});

router.use(verifyJWT, requireAjayAdmin, requireAdminIpWhitelist);

router.get('/auth/me', async (req, res) => {
  const user = await User.findById(req.user.id).select('_id email name role');
  if (!user || user.role !== 'admin') {
    return res.status(404).json({ error: 'Admin session not found' });
  }

  return res.json({
    admin: {
      id: user._id,
      email: user.email,
      name: user.name,
    },
  });
});

router.get('/auth/sessions', async (req, res) => {
  const sessions = await AdminSession.find({ adminUserId: req.user.id }).sort({ lastSeenAt: -1 }).limit(50);
  return res.json({ sessions });
});

router.post('/auth/logout', async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req, true);
  if (refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    await User.updateOne({ _id: req.user.id }, { $pull: { refreshTokens: refreshTokenHash } });
    await AdminSession.updateOne(
      { adminUserId: req.user.id, refreshTokenHash, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), revokeReason: 'manual-logout' } }
    );
  }
  clearAuthCookies(res, true);
  await logAdminAuthEvent(req, { _id: req.user.id, email: req.user.email, role: 'admin' }, 'ADMIN_LOGOUT', 200);
  return res.json({ message: 'Logged out' });
});

router.post('/auth/logout-all', async (req, res) => {
  await User.updateOne({ _id: req.user.id }, { $set: { refreshTokens: [] } });
  await AdminSession.updateMany(
    { adminUserId: req.user.id, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokeReason: 'logout-all' } }
  );
  clearAuthCookies(res, true);
  await logAdminAuthEvent(req, { _id: req.user.id, email: req.user.email, role: 'admin' }, 'ADMIN_LOGOUT_ALL', 200);
  return res.json({ message: 'All sessions revoked' });
});

router.get('/control/users', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 300);
  const users = await User.find({}).select('-password -refreshTokens -mfaCodeHash -mfaChallengeHash -verificationToken -resetToken -resetTokenExpires').sort({ createdAt: -1 }).limit(limit);
  return res.json({ users });
});

router.patch('/control/users/:id/status', [
  body('status').isIn(['active', 'suspended', 'blocked', 'deleted']),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const oldStatus = user.accountStatus || 'active';
  user.accountStatus = req.body.status;
  await user.save();

  await AuditLog.create({
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'ADMIN_USER_STATUS_UPDATE',
    resource: 'user',
    resourceId: user._id.toString(),
    ipAddress: getRequestIp(req),
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path,
    statusCode: 200,
    metadata: { oldValue: oldStatus, newValue: req.body.status },
  });

  return res.json({ userId: user._id, status: user.accountStatus });
});

router.patch('/control/users/:id/kyc', [
  body('kycStatus').isIn(['pending', 'approved', 'rejected']),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { kycStatus: req.body.kycStatus } }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ userId: user._id, kycStatus: user.kycStatus });
});

router.post('/control/users/:id/reset-password', [
  body('newPassword').isString().isLength({ min: 12 }),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.password = req.body.newPassword;
  user.refreshTokens = [];
  await user.save();
  return res.json({ message: 'User credentials reset' });
});

router.post('/control/users/:id/impersonate', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = signToken({ _id: user._id, email: user.email, role: user.role, name: user.name }, { impersonatedBy: req.user.id });

  await AuditLog.create({
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'ADMIN_IMPERSONATION_ISSUED',
    resource: 'user',
    resourceId: user._id.toString(),
    ipAddress: getRequestIp(req),
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path,
    statusCode: 200,
    metadata: { impersonatedUserEmail: user.email },
  });

  return res.json({ token, impersonatedUserId: user._id });
});

router.get('/control/loads', async (req, res) => {
  const loads = await Load.find({}).sort({ createdAt: -1 }).limit(300);
  return res.json({ loads });
});

router.get('/control/payments', async (req, res) => {
  const payments = await Payment.find({}).sort({ createdAt: -1 }).limit(300);
  return res.json({ payments });
});

router.patch('/control/override', [
  body('targetType').isIn(['booking', 'trip', 'payment', 'status']),
  body('targetId').isString().isLength({ min: 1, max: 120 }),
  body('newState').isObject(),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;

  await AuditLog.create({
    userId: req.user.id,
    userEmail: req.user.email,
    userRole: req.user.role,
    action: 'ADMIN_GLOBAL_OVERRIDE',
    resource: req.body.targetType,
    resourceId: req.body.targetId,
    ipAddress: getRequestIp(req),
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path,
    statusCode: 200,
    metadata: { newValue: req.body.newState },
  });

  return res.json({ applied: true });
});

router.post('/control/kill-switch', [
  body('bookingsPaused').isBoolean(),
  body('paymentsPaused').isBoolean(),
  body('registrationsPaused').isBoolean(),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const value = {
    bookingsPaused: req.body.bookingsPaused,
    paymentsPaused: req.body.paymentsPaused,
    registrationsPaused: req.body.registrationsPaused,
  };

  await AdminControlState.findOneAndUpdate(
    { key: 'kill-switch' },
    {
      $set: {
        value,
        updatedBy: req.user.id,
        updatedFromIp: getRequestIp(req),
      },
    },
    { upsert: true, new: true }
  );

  return res.json({ value });
});

router.get('/control/kill-switch', async (req, res) => {
  const item = await AdminControlState.findOne({ key: 'kill-switch' });
  const value = item?.value || {
    bookingsPaused: false,
    paymentsPaused: false,
    registrationsPaused: false,
  };
  return res.json({ value });
});

router.post('/pricing/plans', [
  body('name').isString().isLength({ min: 2, max: 120 }),
  body('code').isString().isLength({ min: 2, max: 50 }),
  body('pricing.monthly').isNumeric(),
  body('pricing.quarterly').isNumeric(),
  body('pricing.yearly').isNumeric(),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const plan = await SubscriptionPlan.create({
    ...req.body,
    pricingVersion: 1,
  });
  return res.status(201).json({ plan });
});

router.get('/pricing/plans', async (req, res) => {
  const plans = await SubscriptionPlan.find({}).sort({ createdAt: -1 });
  return res.json({ plans });
});

router.patch('/pricing/plans/:id', async (req, res) => {
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const previousPricing = { ...plan.pricing.toObject() };
  const incomingPricing = req.body.pricing || previousPricing;
  const applyOnRenewalOnly = req.body.applyOnRenewalOnly !== false;

  if (req.body.scheduleAt) {
    plan.pendingPriceChange = {
      pricing: incomingPricing,
      effectiveFrom: new Date(req.body.scheduleAt),
      applyOnRenewalOnly,
    };
  } else {
    plan.pricing = incomingPricing;
    plan.pricingVersion += 1;
    plan.nextRenewalPriceOnly = applyOnRenewalOnly;
    for (const cycle of ['monthly', 'quarterly', 'yearly']) {
      if (Number(previousPricing[cycle]) !== Number(incomingPricing[cycle])) {
        plan.priceHistory.push({
          billingCycle: cycle,
          oldPrice: Number(previousPricing[cycle]),
          newPrice: Number(incomingPricing[cycle]),
          effectiveFrom: new Date(),
          changedBy: req.user.id,
          changeType: 'manual-update',
        });
      }
    }
  }

  if (typeof req.body.taxPercent === 'number') plan.taxPercent = req.body.taxPercent;
  if (typeof req.body.platformFeePercent === 'number') plan.platformFeePercent = req.body.platformFeePercent;
  if (typeof req.body.trialDays === 'number') plan.trialDays = req.body.trialDays;
  if (typeof req.body.active === 'boolean') plan.active = req.body.active;
  if (Array.isArray(req.body.featureMapping)) plan.featureMapping = req.body.featureMapping;
  if (Array.isArray(req.body.regionMultipliers)) plan.regionMultipliers = req.body.regionMultipliers;
  if (Array.isArray(req.body.festivalPricing)) plan.festivalPricing = req.body.festivalPricing;
  if (Array.isArray(req.body.coupons)) plan.coupons = req.body.coupons;

  await plan.save();
  return res.json({ plan });
});

router.post('/pricing/plans/:id/rollback', [
  body('targetVersion').isInt({ min: 1 }),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const targetVersion = Number(req.body.targetVersion);
  if (targetVersion >= plan.pricingVersion) {
    return res.status(400).json({ error: 'Target version must be older than current version' });
  }

  const targetChange = [...plan.priceHistory].reverse().find((entry) => entry.rollbackFromVersion === targetVersion || entry.newPrice);
  if (!targetChange) {
    return res.status(404).json({ error: 'No rollback source found for target version' });
  }

  const cycle = targetChange.billingCycle;
  const currentPrice = Number(plan.pricing[cycle]);
  plan.pricing[cycle] = targetChange.oldPrice;
  plan.pricingVersion += 1;
  plan.priceHistory.push({
    billingCycle: cycle,
    oldPrice: currentPrice,
    newPrice: targetChange.oldPrice,
    effectiveFrom: new Date(),
    changedBy: req.user.id,
    changeType: 'rollback',
    rollbackFromVersion: targetVersion,
  });

  await plan.save();
  return res.json({ plan });
});

router.post('/revenue/ledger/entry', [
  body('sourceType').isIn(['booking', 'subscription', 'manual-adjustment', 'refund', 'settlement']),
  body('debit').isNumeric(),
  body('credit').isNumeric(),
  body('accountCode').isString().isLength({ min: 2, max: 80 }),
  body('counterpartyAccountCode').isString().isLength({ min: 2, max: 80 }),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const entry = await LedgerEntry.create({
    ...req.body,
    entryId: crypto.randomUUID(),
    createdBy: req.user.id,
  });
  return res.status(201).json({ entry });
});

router.get('/revenue/summary', async (req, res) => {
  const [payments, subscriptionRevenueAgg, ledgerAgg] = await Promise.all([
    Payment.find({}).select('status amount createdAt').lean(),
    LedgerEntry.aggregate([
      { $match: { sourceType: 'subscription' } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$credit', '$debit'] } } } },
    ]),
    LedgerEntry.aggregate([
      { $group: { _id: null, totalCredit: { $sum: '$credit' }, totalDebit: { $sum: '$debit' } } },
    ]),
  ]);

  const paymentStats = payments.reduce((acc, item) => {
    if (item.status === 'success' || item.status === 'captured') acc.success += item.amount;
    else if (item.status === 'failed') acc.failed += item.amount;
    else if (item.status === 'refund') acc.refund += item.amount;
    else acc.pending += item.amount;
    return acc;
  }, { success: 0, failed: 0, refund: 0, pending: 0 });

  const subscriptionRevenue = subscriptionRevenueAgg[0]?.total || 0;
  const ledgerTotals = ledgerAgg[0] || { totalCredit: 0, totalDebit: 0 };

  return res.json({
    payments: paymentStats,
    subscriptionRevenue,
    ledger: ledgerTotals,
  });
});

router.post('/fraud/events', [
  body('eventType').isIn(['fake-booking', 'abnormal-pricing', 'repeated-cancellation', 'wallet-abuse', 'manual-flag']),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('riskScore').isNumeric(),
  body('description').isString().isLength({ min: 4, max: 1200 }),
  body('actorUserId').optional().isMongoId(),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const event = await FraudEvent.create(req.body);

  if (event.riskScore >= 85 && event.actorUserId) {
    await User.updateOne({ _id: event.actorUserId }, { $set: { walletFrozen: true, accountStatus: 'blocked' } });
    event.autoFrozen = true;
    await event.save();
  }

  return res.status(201).json({ event });
});

router.get('/fraud/events', async (req, res) => {
  const events = await FraudEvent.find({}).sort({ createdAt: -1 }).limit(300);
  return res.json({ events });
});

router.post('/automation/rules', [
  body('name').isString().isLength({ min: 3, max: 120 }),
  body('trigger.type').isIn(['truck-idle', 'price-low', 'demand-high', 'custom-metric']),
  body('trigger.threshold').isNumeric(),
  body('trigger.unit').isString().isLength({ min: 1, max: 20 }),
  body('action.type').isIn(['send-alert', 'suggest-price-increase', 'increase-commission', 'freeze-account', 'custom']),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const rule = await AutomationRule.create({
    ...req.body,
    createdBy: req.user.id,
  });
  return res.status(201).json({ rule });
});

router.get('/automation/rules', async (req, res) => {
  const rules = await AutomationRule.find({}).sort({ createdAt: -1 });
  return res.json({ rules });
});

router.post('/ai/decision-logs', [
  body('modelKey').isString().isLength({ min: 2, max: 120 }),
  body('decisionType').isIn(['pricing', 'matching', 'risk-score', 'fraud-detection']),
  body('input').isObject(),
  body('output').isObject(),
  body('explanation').isString().isLength({ min: 8, max: 2000 }),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const log = await AiDecisionLog.create(req.body);
  return res.status(201).json({ log });
});

router.patch('/ai/decision-logs/:id/review', [
  body('approvedByAdmin').isBoolean(),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  const log = await AiDecisionLog.findByIdAndUpdate(req.params.id, {
    $set: {
      approvedByAdmin: req.body.approvedByAdmin,
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
    },
  }, { new: true });
  if (!log) return res.status(404).json({ error: 'AI decision not found' });
  return res.json({ log });
});

router.get('/ai/decision-logs', async (req, res) => {
  const logs = await AiDecisionLog.find({}).sort({ createdAt: -1 }).limit(300);
  return res.json({ logs });
});

router.get('/analytics/control-tower', async (req, res) => {
  const [
    users,
    loads,
    payments,
    fraudOpen,
    routes,
  ] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Load.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    FraudEvent.countDocuments({ resolved: false }),
    Load.aggregate([
      {
        $group: {
          _id: { origin: '$origin', destination: '$destination' },
          trips: { $sum: 1 },
          freight: { $sum: { $ifNull: ['$freightPrice', 0] } },
        },
      },
      { $sort: { trips: -1 } },
      { $limit: 20 },
    ]),
  ]);

  return res.json({
    usersByRole: users,
    loadStatus: loads,
    paymentStatus: payments,
    openFraudAlerts: fraudOpen,
    topRoutes: routes,
  });
});

router.get('/audit/actions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '150', 10), 400);
  const logs = await AuditLog.find({ userRole: 'admin' }).sort({ createdAt: -1 }).limit(limit);
  return res.json({ logs });
});

// ── Admin GST Invoice Visibility ──────────────────────────────────────────────

router.get('/control/gst/invoices', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      const allowed = new Set(['draft', 'issued', 'paid', 'cancelled']);
      if (allowed.has(String(req.query.status))) {
        filter.status = String(req.query.status);
      }
    }

    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    if (req.query.shipper) {
      filter.shipper = new RegExp(String(req.query.shipper).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(String(req.query.from));
      if (req.query.to) filter.date.$lte = new Date(String(req.query.to));
    }

    const [invoices, total] = await Promise.all([
      GstInvoice.find(filter)
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GstInvoice.countDocuments(filter),
    ]);

    return res.json({
      invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin GST invoice list error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.get('/control/gst/invoices/:id', async (req, res) => {
  try {
    const invoice = await GstInvoice.findById(req.params.id).lean();
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    return res.json({ invoice });
  } catch (error) {
    console.error('Admin GST invoice fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// ── Admin Support Ticket Management ──────────────────────────────────────────

const ALLOWED_TICKET_STATUSES = new Set(['open', 'in-progress', 'resolved', 'closed']);
const ALLOWED_TICKET_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);

router.get('/control/support/tickets', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status && ALLOWED_TICKET_STATUSES.has(String(req.query.status))) {
      filter.status = String(req.query.status);
    }

    if (req.query.priority && ALLOWED_TICKET_PRIORITIES.has(String(req.query.priority))) {
      filter.priority = String(req.query.priority);
    }

    if (req.query.email) {
      filter.email = String(req.query.email).toLowerCase().trim();
    }

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(String(req.query.from));
      if (req.query.to) filter.createdAt.$lte = new Date(String(req.query.to));
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    return res.json({
      tickets,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin support tickets error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/control/support/tickets/:id', async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).lean();
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json({ ticket });
  } catch (error) {
    console.error('Admin support ticket fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

router.patch('/control/support/tickets/:id/status', [
  body('status').isIn([...ALLOWED_TICKET_STATUSES]).withMessage('Invalid status value'),
], async (req, res) => {
  if (!ensureValidRequest(req, res)) return;
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const oldStatus = ticket.status;
    ticket.status = req.body.status;
    await ticket.save();

    await AuditLog.create({
      userId: req.user.id,
      userEmail: req.user.email,
      userRole: req.user.role,
      action: 'ADMIN_SUPPORT_TICKET_STATUS_UPDATE',
      resource: 'support-ticket',
      resourceId: ticket._id.toString(),
      ipAddress: getRequestIp(req),
      userAgent: req.get('user-agent'),
      method: req.method,
      path: req.path,
      statusCode: 200,
      metadata: { oldValue: oldStatus, newValue: req.body.status },
    });

    return res.json({ ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status: ticket.status });
  } catch (error) {
    console.error('Admin support ticket status update error:', error.message);
    return res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

export default router;
