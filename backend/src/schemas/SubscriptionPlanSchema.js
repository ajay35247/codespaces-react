import mongoose from 'mongoose';

const featureSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    limit: { type: Number },
  },
  { _id: false }
);

const priceHistorySchema = new mongoose.Schema(
  {
    billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], required: true },
    oldPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    rollbackFromVersion: { type: Number },
    pricingVersionAtChange: { type: Number },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changeType: { type: String, enum: ['manual-update', 'scheduled-change', 'rollback'], required: true },
  },
  { _id: false }
);

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    description: { type: String },
    active: { type: Boolean, default: true },
    trialDays: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    platformFeePercent: { type: Number, default: 0 },
    pricing: {
      monthly: { type: Number, required: true },
      quarterly: { type: Number, required: true },
      yearly: { type: Number, required: true },
    },
    coupons: [{
      code: { type: String, required: true },
      discountPercent: { type: Number, required: true },
      expiresAt: { type: Date },
      maxRedemptions: { type: Number },
    }],
    festivalPricing: [{
      label: { type: String, required: true },
      startAt: { type: Date, required: true },
      endAt: { type: Date, required: true },
      discountPercent: { type: Number, required: true },
    }],
    regionMultipliers: [{
      region: { type: String, required: true },
      multiplier: { type: Number, required: true },
    }],
    featureMapping: [featureSchema],
    pricingVersion: { type: Number, default: 1 },
    nextRenewalPriceOnly: { type: Boolean, default: true },
    pendingPriceChange: {
      pricing: {
        monthly: { type: Number },
        quarterly: { type: Number },
        yearly: { type: Number },
      },
      effectiveFrom: { type: Date },
      applyOnRenewalOnly: { type: Boolean, default: true },
    },
    priceHistory: [priceHistorySchema],
  },
  { timestamps: true }
);

export default mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
