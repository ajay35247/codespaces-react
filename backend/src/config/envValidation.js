import { getAllowedOriginsFromEnv } from './origins.js';

function isMissing(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

export function validateStartupEnv() {
  const issues = [];
  const isProd = process.env.NODE_ENV === 'production';

  if (isMissing(process.env.JWT_SECRET)) {
    issues.push('JWT_SECRET is required.');
  }

  if (isMissing(process.env.JWT_REFRESH_SECRET)) {
    issues.push('JWT_REFRESH_SECRET is required.');
  }

  const origins = getAllowedOriginsFromEnv();
  if (origins.length === 0) {
    issues.push('At least one allowed origin must be configured via FRONTEND_URL, CLIENT_URL, or ALLOWED_ORIGINS.');
  }

  const requireAdminMfaEmail = process.env.REQUIRE_ADMIN_MFA_EMAIL === 'true' || isProd;
  if (requireAdminMfaEmail) {
    const emailRequired = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_FROM'];
    const missing = emailRequired.filter((key) => isMissing(process.env[key]));
    if (missing.length > 0) {
      issues.push(`Admin MFA email delivery is required but missing: ${missing.join(', ')}.`);
    }
  }

  if (issues.length === 0) {
    return;
  }

  if (isProd) {
    throw new Error(`Startup environment validation failed: ${issues.join(' ')}`);
  }

  for (const issue of issues) {
    console.warn(`Env warning: ${issue}`);
  }
}
