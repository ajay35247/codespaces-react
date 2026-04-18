import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: { type: String, index: true },
  planId: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  sender: { type: String, required: true },
  receiver: { type: String, default: 'speedy-trucks-platform' },
  status: {
    type: String,
    enum: ['pending', 'captured', 'failed', 'refunded', 'success'],
    default: 'pending',
  },
  webhookEvent: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('Payment', PaymentSchema);
