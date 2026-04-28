import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  transactionId: { type: String, required: true, unique: true },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: { type: String, index: true },
  planId: { type: String },
  // Billing cycle of the subscription this payment activates. 'monthly' is
  // the legacy default (kept for back-compat with rows written before the
  // 4-tier overhaul). 'yearly' = 12-month window, gets the 2-month-free
  // discount applied at checkout time. getActiveSubscription() reads this
  // to decide the renewal window length.
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly',
  },
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
