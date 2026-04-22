const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'ajay35247@gmail.com').toLowerCase().trim();
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Sharma@76210';

const blockedEmails = new Set(
  (process.env.BLOCKED_ACCOUNT_EMAILS || 'guest@aptrucking.in,demo@aptrucking.in,admin@example.com')
    .split(',')
    .map((item) => item.toLowerCase().trim())
    .filter(Boolean)
);

export function getAdminEmail() {
  return ADMIN_EMAIL;
}

export function getAdminBootstrapPassword() {
  return ADMIN_BOOTSTRAP_PASSWORD;
}

export function normalizeEmail(email = '') {
  return String(email).toLowerCase().trim();
}

export function isBlockedAccountEmail(email = '') {
  return blockedEmails.has(normalizeEmail(email));
}

export function isAjayAdmin(email = '', role = '') {
  return normalizeEmail(email) === ADMIN_EMAIL && role === 'admin';
}

export function getStrongPasswordErrors(password = '') {
  const value = String(password);
  const errors = [];

  if (value.length < 12) {
    errors.push('Password must be at least 12 characters long.');
  }
  if (!/[A-Z]/.test(value)) {
    errors.push('Password must include at least one uppercase letter.');
  }
  if (!/[a-z]/.test(value)) {
    errors.push('Password must include at least one lowercase letter.');
  }
  if (!/[0-9]/.test(value)) {
    errors.push('Password must include at least one number.');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)) {
    errors.push('Password must include at least one special character.');
  }

  return errors;
}

export function isStrongPassword(password = '') {
  return getStrongPasswordErrors(password).length === 0;
}

// Public-facing (end-user) password policy: keep it short and simple per product
// requirements – between 6 and 8 characters, no complexity requirement. Admin
// and privileged-reset flows continue to use the stricter `getStrongPasswordErrors`.
export const PUBLIC_PASSWORD_MIN_LENGTH = 6;
export const PUBLIC_PASSWORD_MAX_LENGTH = 8;

export function getPublicPasswordErrors(password = '') {
  const value = String(password);
  const errors = [];

  if (value.length < PUBLIC_PASSWORD_MIN_LENGTH || value.length > PUBLIC_PASSWORD_MAX_LENGTH) {
    errors.push(
      `Password must be between ${PUBLIC_PASSWORD_MIN_LENGTH} and ${PUBLIC_PASSWORD_MAX_LENGTH} characters.`
    );
  }

  return errors;
}