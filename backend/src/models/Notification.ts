import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: 'load_match' | 'vehicle_available' | 'booking_update' | 'trip_update';
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
}

const NotificationSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true, enum: ['load_match', 'vehicle_available', 'booking_update', 'trip_update'] },
  title: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  isRead: { type: Boolean, default: false },
  priority: { type: String, required: true, enum: ['low', 'medium', 'high'], default: 'medium' }
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);