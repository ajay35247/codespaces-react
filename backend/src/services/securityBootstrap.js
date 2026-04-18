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
  const bootstrapPassword = getAdminBootstrapPassword();

  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount > 1) {
    throw new Error('Security policy violation: multiple admin accounts found.');
  }

  const existing = await User.findOne({ email: adminEmail });
  if (existing) {
    if (existing.role !== 'admin' || !existing.mfaEnabled || existing.accountStatus !== 'active' || !existing.isEmailVerified) {
      existing.role = 'admin';
      existing.mfaEnabled = true;
      existing.accountStatus = 'active';
      existing.isEmailVerified = true;
      await existing.save();
    }
    return;
  }

  if (!bootstrapPassword) {
    console.warn('ADMIN_BOOTSTRAP_PASSWORD is not set; admin bootstrap account was not created.');
    return;
  }

  const admin = new User({
    name: 'Ajay Sharma',
    email: normalizeEmail(adminEmail),
    password: bootstrapPassword,
    role: 'admin',
    isEmailVerified: true,
    mfaEnabled: true,
  });

  await admin.save();
  console.info('Security bootstrap created the admin account.');
}