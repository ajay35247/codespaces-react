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

// Proof-of-Delivery sub-document submitted by the assigned driver when a
// load is marked delivered.  Photo is stored as a `data:image/...` URL with
// a hard size cap enforced at the route layer to avoid pulling in object
// storage just for the MVP loop.
const PodSchema = new mongoose.Schema({
  note: { type: String, default: '' },
  receiverName: { type: String, required: true },
  receiverPhone: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deliveredAt: { type: Date, default: Date.now },
}, { _id: false });

// Payment lifecycle for a single load, decoupled from subscription Payments.
//   pending  → no payment action yet
//   released → shipper has acknowledged release of freight payment to driver
//   received → driver has acknowledged receipt of freight payment
const LoadPaymentSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'released', 'received'],
    default: 'pending',
  },
  releasedAt: { type: Date, default: null },
  receivedAt: { type: Date, default: null },
  releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

// Bilateral one-per-role rating tied to a delivered load.
const LoadRatingSchema = new mongoose.Schema({
  raterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rateeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  raterRole: { type: String, enum: ['shipper', 'driver'], required: true },
  stars: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: '' },
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
  pod: { type: PodSchema, default: null },
  payment: { type: LoadPaymentSchema, default: () => ({}) },
  ratings: { type: [LoadRatingSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Load', LoadSchema);
