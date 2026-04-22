import mongoose from 'mongoose';

const BidSchema = new mongoose.Schema({
  // New: generic bidder fields — shippers, drivers, and brokers can all bid.
  bidderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bidderRole: {
    type: String,
    enum: ['shipper', 'driver', 'broker'],
  },
  // Legacy field kept for backward compatibility with pre-migration documents.
  // Newer code reads `bidderId` and falls back to `brokerId` when it is not
  // present so historical bids remain queryable.
  brokerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
  assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  acceptedBidId: { type: mongoose.Schema.Types.ObjectId, default: null },
  bids: [BidSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Load', LoadSchema);
