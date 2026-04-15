import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.Mixed }, // string for demo user
    userEmail: { type: String },
    userRole: { type: String },
    action: { type: String, required: true },
    resource: { type: String },
    resourceId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    method: { type: String },
    path: { type: String },
    statusCode: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model('AuditLog', AuditLogSchema);
