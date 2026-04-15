import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: mongoose.Types.ObjectId;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const AuditLogSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true }, // CREATE, UPDATE, DELETE, LOGIN, etc.
  resource: { type: String, required: true }, // User, Vehicle, Load, etc.
  resourceId: { type: Schema.Types.ObjectId },
  oldData: { type: Schema.Types.Mixed },
  newData: { type: Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now }
});

AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export class AuditService {
  static async log(
    userId: string | null,
    action: string,
    resource: string,
    resourceId?: string,
    oldData?: any,
    newData?: any,
    req?: any
  ): Promise<void> {
    try {
      const auditLog = new AuditLog({
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        action,
        resource,
        resourceId: resourceId ? new mongoose.Types.ObjectId(resourceId) : undefined,
        oldData,
        newData,
        ipAddress: req?.ip || req?.connection?.remoteAddress,
        userAgent: req?.get('User-Agent')
      });

      await auditLog.save();
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw error to avoid breaking main flow
    }
  }
}