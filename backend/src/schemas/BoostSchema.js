import mongoose from 'mongoose';

/**
 * Boost = paid one-shot add-on applied to a single load (or other entity)
 * to increase visibility on top of the user's underlying subscription.
 *
 * Catalogue is currently static (see BOOST_CATALOG below); making it
 * admin-tunable is a follow-up — the document model already separates
 * `productCode` from `unitPrice` so we can add a Mongo-backed catalogue
 * later without changing the schema.
 *
 * Lifecycle:
 *   pending  → order created, awaiting Razorpay verify
 *   active   → payment captured, the boost is in effect
 *   expired  → expiresAt has passed
 *   refunded → admin/auto refund flow
 *
 * `expiresAt` is set when the boost is activated (= now + durationMs).
 * The Load search ranker (services/searchService.js) reads active boosts
 * via the `targetType=load,targetId,expiresAt>now` predicate.
 */

export const BOOST_CATALOG = Object.freeze({
  highlight: {
    code: 'highlight',
    name: 'Highlight Listing',
    description: 'Highlight your load with a coloured ribbon for 24 hours.',
    unitPrice: 19, // INR
    durationMs: 24 * 60 * 60 * 1000,
    targetType: 'load',
    rankBoost: 2.0,
  },
  feature: {
    code: 'feature',
    name: 'Featured Listing',
    description: 'Show your load above standard results for 24 hours.',
    unitPrice: 49, // INR
    durationMs: 24 * 60 * 60 * 1000,
    targetType: 'load',
    rankBoost: 5.0,
  },
});

export const BOOST_CODES = Object.freeze(Object.keys(BOOST_CATALOG));

const BoostSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productCode: { type: String, enum: [...BOOST_CODES], required: true },
    targetType: { type: String, enum: ['load'], default: 'load' },
    // Set when the buyer applies the boost to a specific load.  Until then
    // the boost is "purchased but unattached" — buying first and applying
    // later mirrors the upgrade flow most users expect.
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    unitPrice: { type: Number, required: true },     // snapshot at purchase
    rankBoost: { type: Number, required: true },     // snapshot at purchase
    durationMs: { type: Number, required: true },    // snapshot at purchase
    razorpayOrderId: { type: String, index: true, required: true },
    razorpayPaymentId: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'expired', 'refunded'],
      default: 'pending',
      index: true,
    },
    activatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// Helper for the ranker — finds active boosts for a load efficiently.
BoostSchema.index({ targetType: 1, targetId: 1, status: 1, expiresAt: 1 });

export default mongoose.models.Boost || mongoose.model('Boost', BoostSchema);
