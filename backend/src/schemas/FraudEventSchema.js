import mongoose from 'mongoose';

const FraudEventSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String },
    eventType: {
      type: String,
      enum: ['fake-booking', 'abnormal-pricing', 'repeated-cancellation', 'wallet-abuse', 'manual-flag'],
      required: true,
    },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    riskScore: { type: Number, min: 0, max: 100, required: true },
    description: { type: String, required: true },
    evidence: [{ type: String }],
    autoFrozen: { type: Boolean, default: false },
    resolved: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

FraudEventSchema.index({ resolved: 1, severity: 1, createdAt: -1 });

export default mongoose.model('FraudEvent', FraudEventSchema);
