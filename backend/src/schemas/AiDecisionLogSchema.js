import mongoose from 'mongoose';

const AiDecisionLogSchema = new mongoose.Schema(
  {
    modelKey: { type: String, required: true },
    decisionType: { type: String, enum: ['pricing', 'matching', 'risk-score', 'fraud-detection'], required: true },
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    output: { type: mongoose.Schema.Types.Mixed, required: true },
    explanation: { type: String, required: true },
    approvedByAdmin: { type: Boolean, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

AiDecisionLogSchema.index({ decisionType: 1, createdAt: -1 });

export default mongoose.model('AiDecisionLog', AiDecisionLogSchema);
