import nodemailer from 'nodemailer';

const host = process.env.EMAIL_HOST;
const port = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined;
const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;
const from = process.env.EMAIL_FROM || 'Speedy Trucks <no-reply@aptrucking.in>';

const transporter = host && port && user && pass
  ? nodemailer.createTransport({
      host,
      port,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user, pass },
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
    required: process.env.REQUIRE_ADMIN_MFA_EMAIL === 'true' || process.env.NODE_ENV === 'production',
    context: 'admin-mfa',
  });
}
