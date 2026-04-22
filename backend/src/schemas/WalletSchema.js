import mongoose from 'mongoose';

/**
 * Per-user INR wallet balance. Top-ups credit the wallet via Razorpay, and
 * advanced features (withdrawals, instant load-post fees, fast-lane payments)
 * debit from it. Balance updates MUST go through atomic `$inc` operations to
 * prevent lost-update race conditions between concurrent transactions.
 */
const WalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    locked: { type: Boolean, default: false },
    lastTransactionAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Wallet', WalletSchema);
