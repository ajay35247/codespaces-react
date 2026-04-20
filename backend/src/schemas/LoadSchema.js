import mongoose from 'mongoose';

const BidSchema = new mongoose.Schema({
  brokerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

const LoadSchema = new mongoose.Schema({
  loadId: { type: String, required: true, unique: true },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  weight: { type: String, required: true },
  truckType: { type: String, required: true },
  status: {
    type: String,
    enum: ['posted', 'in-transit', 'delivered', 'cancelled'],
    default: 'posted',
  },
  freightPrice: { type: Number },
  pickupDate: { type: Date },
  dropDate: { type: Date },
  documents: [{ type: String }],
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  postedByRole: { type: String },
  bids: [BidSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Load', LoadSchema);
