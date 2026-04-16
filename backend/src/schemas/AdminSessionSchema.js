import mongoose from 'mongoose';

const AdminSessionSchema = new mongoose.Schema(
  {
    adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    refreshTokenHash: { type: String, required: true, index: true },
    ipAddress: { type: String, required: true },
    userAgent: { type: String },
    deviceId: { type: String },
    loginAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
    revokeReason: { type: String },
  },
  { timestamps: true }
);

AdminSessionSchema.index({ adminUserId: 1, lastSeenAt: -1 });

export default mongoose.model('AdminSession', AdminSessionSchema);
