import mongoose from 'mongoose';

const LedgerEntrySchema = new mongoose.Schema(
  {
    entryId: { type: String, required: true, unique: true },
    txRef: { type: String, index: true },
    sourceType: { type: String, enum: ['booking', 'subscription', 'manual-adjustment', 'refund', 'settlement'], required: true },
    sourceId: { type: String },
    currency: { type: String, default: 'INR' },
    debit: { type: Number, required: true, min: 0 },
    credit: { type: Number, required: true, min: 0 },
    accountCode: { type: String, required: true, index: true },
    counterpartyAccountCode: { type: String, required: true, index: true },
    notes: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

LedgerEntrySchema.index({ createdAt: -1, sourceType: 1 });

export default mongoose.model('LedgerEntry', LedgerEntrySchema);
