import { getAllowedOriginsFromEnv } from './origins.js';

function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

export function validateStartupEnv() {
  const issues = [];
  const warnings = [];
  const isProd = process.env.NODE_ENV === 'production';

  // JWT secrets — always required
  if (isMissing(process.env.JWT_SECRET)) {
    issues.push('JWT_SECRET is required.');
  }
  if (isMissing(process.env.JWT_REFRESH_SECRET)) {
    issues.push('JWT_REFRESH_SECRET is required.');
  }

  // Origins — warn in production instead of crashing
  const origins = getAllowedOriginsFromEnv();
  if (origins.length === 0) {
    if (isProd) {
      warnings.push(
        'No allowed origins configured (FRONTEND_URL, CLIENT_URL, or ALLOWED_ORIGINS). CORS may block all requests.'
      );
    } else {
      issues.push(
        'At least one allowed origin must be configured via FRONTEND_URL, CLIENT_URL, or ALLOWED_ORIGINS.'
      );
    }
  }

  // Email — required in production for admin MFA
  const requireAdminMfaEmail =
    process.env.REQUIRE_ADMIN_MFA_EMAIL === 'true' || isProd;

  if (requireAdminMfaEmail) {
    const emailRequired = [
      'EMAIL_HOST',
      'EMAIL_PORT',
      'EMAIL_USER',
      'EMAIL_PASS',
      'EMAIL_FROM',
    ];
    const missing = emailRequired.filter((key) => isMissing(process.env[key]));
    if (missing.length > 0) {
      issues.push(
        `Admin MFA email delivery is required but missing: ${missing.join(', ')}.`
      );
    }

    // Enforce SMTP port/secure pairing — wrong pairing causes the SMTP
    // handshake to hang until socket timeout, blocking admin login.
    const smtpPort = Number(process.env.EMAIL_PORT);
    const smtpSecure = process.env.EMAIL_SECURE === 'true';
    if (smtpPort === 465 && !smtpSecure) {
      issues.push('EMAIL_PORT=465 requires EMAIL_SECURE=true.');
    }
    if (smtpPort === 587 && smtpSecure) {
      issues.push('EMAIL_PORT=587 requires EMAIL_SECURE=false (STARTTLS).');
    }
  }

  // Admin identity — required in all environments
  if (isMissing(process.env.ADMIN_EMAIL)) {
    issues.push('ADMIN_EMAIL is required. Set it to the designated admin email address.');
  }
  if (isMissing(process.env.ADMIN_BOOTSTRAP_PASSWORD)) {
    issues.push('ADMIN_BOOTSTRAP_PASSWORD is required. Set a strong, unique password.');
  }
  if (isMissing(process.env.ADMIN_PRIVATE_PATH_SEGMENT)) {
    warnings.push(
      'ADMIN_PRIVATE_PATH_SEGMENT is not set. Defaulting to "admin" — set a random secret segment for security.'
    );
  }

  // Print warnings — never crash for these
  for (const warning of warnings) {
    console.warn(`Env warning: ${warning}`);
  }

  // No issues — all good
  if (issues.length === 0) {
    return;
  }

  // In production, only crash for truly critical issues
  // Everything else warns so the app can still start
  const critical = issues.filter(
    (i) => i.includes('JWT_SECRET') || i.includes('JWT_REFRESH_SECRET')
      || i.includes('ADMIN_EMAIL') || i.includes('ADMIN_BOOTSTRAP_PASSWORD')
  );
  const nonCritical = issues.filter(
    (i) => !critical.includes(i)
  );

  for (const issue of nonCritical) {
    console.warn(`Env warning: ${issue}`);
  }

  if (critical.length > 0) {
    throw new Error(
      `Startup environment validation failed: ${critical.join(' ')}`
    );
  }
}
