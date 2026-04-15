import mongoose from 'mongoose';
import User from '../schemas/UserSchema.js';
import {
  getAdminBootstrapPassword,
  getAdminEmail,
  normalizeEmail,
} from '../utils/securityPolicy.js';

export async function ensureAdminAccount() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const adminEmail = getAdminEmail();
  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    if (existing.role !== 'admin' || !existing.mfaEnabled) {
      existing.role = 'admin';
      existing.mfaEnabled = true;
      existing.isEmailVerified = true;
      await existing.save();
    }
    return;
  }

  const admin = new User({
    name: 'Ajay Sharma',
    email: normalizeEmail(adminEmail),
    password: getAdminBootstrapPassword(),
    role: 'admin',
    isEmailVerified: true,
    mfaEnabled: true,
  });

  await admin.save();
  console.info('Security bootstrap created the admin account.');
}