import mongoose from 'mongoose';

const TollTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vehicleNumber: { type: String, required: true, uppercase: true, trim: true },
    tagId: { type: String, trim: true, default: null },
    tollName: { type: String, required: true, trim: true },
    tollLocation: { type: String, required: true, trim: true },
    highway: { type: String, trim: true, default: null },
    lane: { type: String, trim: true, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    balanceAfter: { type: Number, default: null },
    transactionRef: { type: String, trim: true, unique: true, sparse: true },
    source: {
      type: String,
      enum: ['manual', 'fastag', 'cash'],
      default: 'fastag',
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'pending'],
      default: 'success',
    },
    direction: {
      type: String,
      enum: ['entry', 'exit', 'single'],
      default: 'single',
    },
    crossedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

TollTransactionSchema.index({ userId: 1, crossedAt: -1 });

export default mongoose.model('TollTransaction', TollTransactionSchema);
