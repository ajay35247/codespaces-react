import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const TruckSchema = new mongoose.Schema({
  truckId: { type: String, required: true },
  licensePlate: { type: String, required: true },
  capacity: { type: Number },
  type: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    required: true,
    enum: ['shipper', 'driver', 'broker', 'admin'],
  },
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'blocked', 'deleted'],
    default: 'active',
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  walletFrozen: { type: Boolean, default: false },
  shadowModeEnabled: { type: Boolean, default: false },
  gstin: { type: String },
  phone: { type: String },
  isEmailVerified: { type: Boolean, default: false },
  mfaEnabled: { type: Boolean, default: false },
  mfaCodeHash: { type: String },
  mfaCodeExpires: { type: Date },
  mfaChallengeHash: { type: String },
  mfaChallengeExpires: { type: Date },
  mfaAttemptCount: { type: Number, default: 0 },
  mfaResendCount: { type: Number, default: 0 },
  mfaLastSentAt: { type: Date },
  failedLoginCount: { type: Number, default: 0 },
  lockUntil: { type: Date },
  verificationToken: { type: String },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  refreshTokens: [{ type: String }],
  trucks: [TruckSchema],
  createdAt: { type: Date, default: Date.now },
});

// Only one admin allowed — partial unique index so it only applies to admin docs
UserSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'admin' },
  }
);

// Sparse indexes so lookups during token flows are fast and don't collide on
// documents where the field is undefined/null.
UserSchema.index({ verificationToken: 1 }, { sparse: true });
UserSchema.index({ resetToken: 1 }, { sparse: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);
