import crypto from 'crypto';

export function isTemporarilyLocked(lockUntil, now = Date.now()) {
  if (!lockUntil) return false;
  const lockMs = lockUntil instanceof Date ? lockUntil.getTime() : Number(lockUntil);
  return Number.isFinite(lockMs) && lockMs > now;
}

export function incrementFailedAttempts(currentCount = 0, maxAttempts = 5) {
  const nextCount = Number(currentCount || 0) + 1;
  if (nextCount >= maxAttempts) {
    return { shouldLock: true, nextCount: 0 };
  }
  return { shouldLock: false, nextCount };
}

export function calculateLockUntil(windowMs = 15 * 60 * 1000, now = Date.now()) {
  return new Date(now + windowMs);
}

export function generateMfaCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function isValidMfaCode(code) {
  return /^\d{6}$/.test(String(code || ''));
}

export function isValidMfaChallengeToken(token) {
  return /^[a-f0-9]{64}$/i.test(String(token || ''));
}
