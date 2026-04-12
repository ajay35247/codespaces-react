import mongoose from 'mongoose';

const LoadSchema = new mongoose.Schema({
  loadId: { type: String, required: true, unique: true },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  weight: { type: String, required: true },
  truckType: { type: String, required: true },
  status: { type: String, default: 'posted' },
  freightPrice: { type: Number },
  pickupDate: { type: Date },
  dropDate: { type: Date },
  documents: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Load', LoadSchema);
