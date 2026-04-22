import mongoose from 'mongoose';

/**
 * Immutable audit record for every wallet credit/debit operation.
 * `balanceAfter` captures the resulting balance so reconciliation does not
 * need to replay the full ledger. Use `reference` to link to Razorpay
 * payment IDs, load IDs, bid IDs, withdrawal request IDs, etc.
 */
const WalletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        'topup',
        'withdrawal',
        'withdrawal-reversal',
        'bid-fee',
        'subscription',
        'refund',
        'adjustment',
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    balanceAfter: { type: Number, required: true, min: 0 },
    reference: { type: String, index: true },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed',
    },
    notes: { type: String },
  },
  { timestamps: true }
);

WalletTransactionSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('WalletTransaction', WalletTransactionSchema);
