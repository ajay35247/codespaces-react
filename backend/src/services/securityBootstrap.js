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
    // Only fix critical fields — never overwrite mfaEnabled so it can be
    // toggled manually in the database without being reset on every restart.
    let needsSave = false;
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      needsSave = true;
    }
    if (existing.accountStatus !== 'active') {
      existing.accountStatus = 'active';
      needsSave = true;
    }
    if (!existing.isEmailVerified) {
      existing.isEmailVerified = true;
      needsSave = true;
    }
    if (needsSave) {
      await existing.save();
    }
    return;
  }
 
  if (!bootstrapPassword) {
    console.warn('ADMIN_BOOTSTRAP_PASSWORD is not set; admin bootstrap account was not created.');
    return;
  }
 
  // Create fresh admin — MFA disabled by default so first login works
  // Admin can enable MFA from the admin panel after first login
  const admin = new User({
    name: 'Ajay Sharma',
    email: normalizeEmail(adminEmail),
    password: bootstrapPassword,
    role: 'admin',
    isEmailVerified: true,
    mfaEnabled: false,
  });
  await admin.save();
  console.info('Security bootstrap created the admin account.');
}
