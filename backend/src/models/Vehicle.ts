import mongoose, { Schema, Document } from 'mongoose';

export interface IVehicle extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  brokerId?: mongoose.Types.ObjectId;
  vehicleNumber: string;
  vehicleCategory: 'bike' | '3_wheeler' | 'mini_truck' | 'pickup' | 'lcv' | 'mcv' | 'hcv' | 'trailer' | 'container' | '20_tyre' | '50_ton';
  bodyType: string;
  capacityTon: number;
  capacityKg: number;
  wheelCount: number;
  containerLength?: number;
  currentLocation: { lat: number; lng: number; address: string };
  availabilityStatus: 'available' | 'busy' | 'on_trip' | 'offline';
  emptyTruckStatus: 'empty' | 'partially_loaded' | 'full';
  currentRoute?: { from: string; to: string; waypoints: { lat: number; lng: number }[] };
  createdAt: Date;
  updatedAt: Date;
}

const VehicleSchema: Schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  brokerId: { type: Schema.Types.ObjectId, ref: 'User' },
  vehicleNumber: { type: String, required: true, unique: true },
  vehicleCategory: { type: String, required: true, enum: ['bike', '3_wheeler', 'mini_truck', 'pickup', 'lcv', 'mcv', 'hcv', 'trailer', 'container', '20_tyre', '50_ton'] },
  bodyType: { type: String, required: true },
  capacityTon: { type: Number, required: true },
  capacityKg: { type: Number, required: true },
  wheelCount: { type: Number, required: true },
  containerLength: { type: Number },
  currentLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true }
  },
  availabilityStatus: { type: String, required: true, enum: ['available', 'busy', 'on_trip', 'offline'], default: 'available' },
  emptyTruckStatus: { type: String, required: true, enum: ['empty', 'partially_loaded', 'full'], default: 'empty' },
  currentRoute: {
    from: { type: String },
    to: { type: String },
    waypoints: [{ lat: Number, lng: Number }]
  }
}, { timestamps: true });

VehicleSchema.index({ 'currentLocation': '2dsphere' });
VehicleSchema.index({ vehicleCategory: 1, availabilityStatus: 1, emptyTruckStatus: 1 });

export const Vehicle = mongoose.model<IVehicle>('Vehicle', VehicleSchema);