import mongoose, { Schema, Document } from 'mongoose';

export interface ILoad extends Document {
  _id: mongoose.Types.ObjectId;
  shipperId: mongoose.Types.ObjectId;
  pickupLocation: { lat: number; lng: number; address: string; city: string; state: string };
  dropLocation: { lat: number; lng: number; address: string; city: string; state: string };
  loadWeight: number;
  loadType: string;
  vehicleRequired: string;
  bodyType: string;
  scheduleTime: Date;
  price?: number;
  bidMode: boolean;
  urgent: boolean;
  status: 'posted' | 'matched' | 'booked' | 'in_transit' | 'delivered' | 'cancelled';
  matchedVehicles: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const LoadSchema: Schema = new Schema({
  shipperId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  pickupLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true }
  },
  dropLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true }
  },
  loadWeight: { type: Number, required: true },
  loadType: { type: String, required: true },
  vehicleRequired: { type: String, required: true },
  bodyType: { type: String, required: true },
  scheduleTime: { type: Date, required: true },
  price: { type: Number },
  bidMode: { type: Boolean, default: false },
  urgent: { type: Boolean, default: false },
  status: { type: String, required: true, enum: ['posted', 'matched', 'booked', 'in_transit', 'delivered', 'cancelled'], default: 'posted' },
  matchedVehicles: [{ type: Schema.Types.ObjectId, ref: 'Vehicle' }]
}, { timestamps: true });

LoadSchema.index({ 'pickupLocation': '2dsphere' });
LoadSchema.index({ 'dropLocation': '2dsphere' });
LoadSchema.index({ status: 1, urgent: 1 });

export const Load = mongoose.model<ILoad>('Load', LoadSchema);