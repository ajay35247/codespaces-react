import nodemailer from 'nodemailer';

const host = process.env.EMAIL_HOST;
const port = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined;
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;
const from = process.env.EMAIL_FROM || 'Speedy Trucks <no-reply@aptrucking.in>';
const secure = process.env.EMAIL_SECURE === 'true';

// Validate port/secure pairing — fail fast on misconfiguration that would
// otherwise hang the SMTP handshake (e.g. TLS-on-587 or plaintext-on-465).
if (host && port) {
  if (port === 465 && !secure) {
    throw new Error('SMTP CONFIG INVALID: EMAIL_PORT=465 requires EMAIL_SECURE=true');
  }
  if (port === 587 && secure) {
    throw new Error('SMTP CONFIG INVALID: EMAIL_PORT=587 requires EMAIL_SECURE=false (STARTTLS)');
  }
}

const transporter = host && port && user && pass
  ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      // Fail fast — never let a hung SMTP socket block an HTTP response.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    })
  : null;

export function isEmailTransportConfigured() {
  return Boolean(transporter);
}

async function sendMail(mailOptions, { required = false, context = 'email' } = {}) {
  if (!transporter) {
    const error = new Error(`Email transporter is not configured for ${context}.`);
    if (required) {
      throw error;
    }
    console.warn(error.message);
    return { skipped: true };
  }

  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(`SMTP ERROR (${context}):`, error.message, error.code || '');
    if (required) {
      throw error;
    }
    console.warn(`Email delivery failed for ${context}: ${error.message}`);
    return { failed: true };
  }
}

export async function sendVerificationEmail(user, verificationUrl) {
  return sendMail({
    from,
    to: user.email,
    subject: 'Verify your Speedy Trucks account',
    html: `
      <p>Hi ${user.name},</p>
      <p>Thank you for registering with Speedy Trucks.</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationUrl}">Verify my email</a></p>
      <p>If you did not sign up, please ignore this email.</p>
      <p>Regards,<br/>Speedy Trucks Team</p>
    `,
  }, { context: 'verification-email' });
}

export async function sendPasswordResetEmail(user, resetUrl) {
  return sendMail({
    from,
    to: user.email,
    subject: 'Reset your Speedy Trucks password',
    html: `
      <p>Hi ${user.name},</p>
      <p>A password reset request was received for your Speedy Trucks account.</p>
      <p>Reset your password by clicking the link below:</p>
      <p><a href="${resetUrl}">Reset my password</a></p>
      <p>If you did not request a reset, please ignore this email.</p>
      <p>Regards,<br/>Speedy Trucks Team</p>
    `,
  }, { context: 'password-reset' });
}

export async function sendAdminMfaCodeEmail(user, code) {
  // Dev/CI bypass: skip SMTP entirely. Caller is responsible for using the
  // fixed bypass code (123456) so the MFA flow remains testable end-to-end.
  if (process.env.ADMIN_MFA_BYPASS === 'true') {
    console.warn('ADMIN_MFA_BYPASS=true — skipping admin MFA email send.');
    return { skipped: true, bypass: true };
  }

  return sendMail({
    from,
    to: user.email,
    subject: 'Your Speedy Trucks admin MFA code',
    html: `
      <p>Hi ${user.name},</p>
      <p>Your one-time admin login verification code is:</p>
      <p style="font-size: 24px; letter-spacing: 4px;"><strong>${code}</strong></p>
      <p>This code expires in 5 minutes.</p>
      <p>If you did not attempt this login, immediately reset your password and review account activity.</p>
    `,
  }, {
    // Login response is no longer awaited on this promise, so we no longer
    // need `required: true` to surface failures via 503. Errors are logged
    // by sendMail and by the caller's `.catch`.
    required: false,
    context: 'admin-mfa',
  });
}

// Fixed bypass code consumed by admin login when ADMIN_MFA_BYPASS=true.
export const ADMIN_MFA_BYPASS_CODE = '123456';
