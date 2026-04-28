import mongoose from 'mongoose';

// All billing cycles supported by the plan editor. Admins may set a price
// (0 – PRICE_MAX_INR) for any subset of these cycles; cycles left undefined
// simply aren't offered to subscribers. Adding a new cycle here is the only
// change needed for it to flow through validation, price-history tracking
// and rollback in routes/admin.js.
export const BILLING_CYCLES = Object.freeze([
  'daily',
  'weekly',
  'fifteenDay', // 15-day plan
  'monthly',
  'quarterly',
  'halfYearly', // 6-month plan
  'yearly',
]);

// Inclusive admin-configurable price range. 0 means the plan is free for
// that cycle; 15000 INR is the upper bound the product team has authorised.
export const PRICE_MIN_INR = 0;
export const PRICE_MAX_INR = 15000;

// Trial length bounds. trialDays = 0 disables the trial entirely; the
// product spec calls out 7 / 15 / 30 day presets, but admins may set any
// value within these bounds at any time.
export const TRIAL_DAYS_MIN = 0;
export const TRIAL_DAYS_MAX = 365;

const cyclePriceField = () => ({
  type: Number,
  min: PRICE_MIN_INR,
  max: PRICE_MAX_INR,
  default: undefined,
});

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
    billingCycle: { type: String, enum: [...BILLING_CYCLES], required: true },
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

const pricingFieldDefinition = BILLING_CYCLES.reduce((acc, cycle) => {
  acc[cycle] = cyclePriceField();
  return acc;
}, {});

const SubscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    description: { type: String },
    active: { type: Boolean, default: true },
    trialDays: {
      type: Number,
      default: 0,
      min: TRIAL_DAYS_MIN,
      max: TRIAL_DAYS_MAX,
    },
    taxPercent: { type: Number, default: 0 },
    platformFeePercent: { type: Number, default: 0 },
    pricing: pricingFieldDefinition,
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
      pricing: BILLING_CYCLES.reduce((acc, cycle) => {
        acc[cycle] = { type: Number, min: PRICE_MIN_INR, max: PRICE_MAX_INR };
        return acc;
      }, {}),
      effectiveFrom: { type: Date },
      applyOnRenewalOnly: { type: Boolean, default: true },
    },
    priceHistory: [priceHistorySchema],
  },
  { timestamps: true }
);

export default mongoose.model('SubscriptionPlan', SubscriptionPlanSchema);
