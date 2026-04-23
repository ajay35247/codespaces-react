import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const TruckSchema = new mongoose.Schema({
  truckId: { type: String, required: true },
  licensePlate: { type: String, required: true },
  capacity: { type: Number },
  type: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// KYC document submitted by the user for manual admin review.  We do not
// integrate a third-party KYC API (Aadhaar/PAN vendors are paid + licensed);
// instead we collect docs + number + holder name and rely on admin approval
// via PATCH /admin/control/users/:id/kyc.  `fileDataUrl` is capped at
// MAX_KYC_FILE_LENGTH in routes/auth.js.
const KycDocumentSchema = new mongoose.Schema({
  docType: {
    type: String,
    enum: ['pan', 'aadhaar', 'driving_license', 'rc_book', 'gstin'],
    required: true,
  },
  number: { type: String, required: true },
  holderName: { type: String, required: true },
  fileDataUrl: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
}, { _id: false });

// Payout destination the user registers for receiving money via RazorpayX
// Payouts.  Either a UPI VPA, or a bank IFSC + account number.  Both are
// stored as-is — the admin/ops flow is expected to register them with
// RazorpayX Contacts + Fund Accounts on first real payout.
const FundAccountSchema = new mongoose.Schema({
  method: { type: String, enum: ['vpa', 'bank'], required: true },
  vpa: { type: String, default: '' },
  accountNumber: { type: String, default: '' },
  ifsc: { type: String, default: '' },
  beneficiaryName: { type: String, default: '' },
  razorpayContactId: { type: String, default: '' },
  razorpayFundAccountId: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    required: true,
    // truck_owner represents a fleet operator that owns trucks and assigns
    // drivers to them — distinct from `driver` (who physically operates a
    // single vehicle) and `broker` (who brokers loads without owning trucks).
    enum: ['shipper', 'driver', 'broker', 'truck_owner', 'admin'],
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
  kycDocuments: { type: [KycDocumentSchema], default: [] },
  kycSubmittedAt: { type: Date, default: null },
  kycReviewedAt: { type: Date, default: null },
  kycRejectionReason: { type: String, default: '' },
  fundAccount: { type: FundAccountSchema, default: null },
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
