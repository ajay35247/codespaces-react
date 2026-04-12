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

async function sendMail(mailOptions) {
  if (!transporter) {
    console.warn('Email transporter is not configured. Skipping email delivery.');
    return;
  }
  return transporter.sendMail(mailOptions);
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
  });
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
  });
}
