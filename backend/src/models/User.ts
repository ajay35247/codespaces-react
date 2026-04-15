import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password: string;
  role: 'shipper' | 'truck_owner' | 'driver' | 'broker' | 'admin';
  name: string;
  phone: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['shipper', 'truck_owner', 'driver', 'broker', 'admin'] },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);