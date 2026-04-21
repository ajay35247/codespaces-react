import mongoose from 'mongoose';

const FasTagWalletSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleNumber: { type: String, required: true, uppercase: true, trim: true },
    tagId: { type: String, trim: true, default: null },
    bankName: { type: String, trim: true, default: null },
    balance: { type: Number, default: 0, min: 0 },
    lowBalanceThreshold: { type: Number, default: 200 },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blacklisted', 'low_balance'],
      default: 'active',
    },
    lastRechargeAmount: { type: Number, default: null },
    lastRechargeAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Automatically manage active/low_balance status transitions on every save.
// 'inactive' and 'blacklisted' statuses are admin-managed and not auto-changed.
FasTagWalletSchema.pre('save', function (next) {
  if (this.status === 'active' && this.balance < this.lowBalanceThreshold) {
    this.status = 'low_balance';
  } else if (this.status === 'low_balance' && this.balance >= this.lowBalanceThreshold) {
    this.status = 'active';
  }
  // 'inactive' and 'blacklisted' statuses are intentionally not auto-modified here.
  next();
});

export default mongoose.model('FasTagWallet', FasTagWalletSchema);
