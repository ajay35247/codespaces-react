import mongoose from 'mongoose';

/**
 * Experiment = a server-controlled A/B test that can replace the canonical
 * pricing returned by `/payments/pricing` with user-bucketed variants.
 *
 * v1 scope: PRICE-only experiments (e.g. ₹199 vs ₹179, ₹299 vs ₹279).
 *
 * Bucketing: deterministic hashing of `userId + experiment.key` mapped onto
 * the cumulative weight of variants. This means a given user always sees
 * the same arm for an experiment without any per-user write — the bucket
 * is computed at request time. See services/experiments.js.
 *
 * Lifecycle:
 *   draft     → admin is configuring; not bucketed at runtime
 *   running   → live, bucketed by userId hash
 *   stopped   → admin paused; runtime falls back to the catalogue price
 *   completed → winner has been recorded on `winningVariantId`
 *
 * Conversion stats: per-variant impressions/conversions are recorded by
 * Experiment.recordImpression() / recordConversion() (atomic $inc).
 */

const ExperimentVariantSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },               // 'control', 'a', 'b', ...
    label: { type: String, default: '' },                // human display
    weight: { type: Number, required: true, min: 1 },    // relative weight; 1+
    // Per-cycle price overrides. Any cycle left undefined inherits the
    // catalogue price for that cycle.
    monthlyPrice: { type: Number, min: 0 },
    yearlyPrice:  { type: Number, min: 0 },
    impressions:  { type: Number, default: 0 },
    conversions:  { type: Number, default: 0 },
  },
  { _id: false }
);

const ExperimentSchema = new mongoose.Schema(
  {
    // Stable URL-friendly identifier the bucketing salts against.  Once set
    // it must NEVER change while the experiment is running, otherwise users
    // will get re-bucketed mid-test and skew results.
    key:  { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    // Which canonical plan code the experiment targets ('basic' | 'standard'
    // | 'premium'). 'free' is intentionally excluded.
    planCode: {
      type: String,
      enum: ['basic', 'standard', 'premium'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'running', 'stopped', 'completed'],
      default: 'draft',
      index: true,
    },
    variants: {
      type: [ExperimentVariantSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: 'An experiment must declare at least two variants.',
      },
    },
    winningVariantId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Only one running experiment per planCode at a time. We enforce this in
// the service layer (atomic findOneAndUpdate guard) and at the API layer
// (admin POST returns 409); a partial unique index would also work but
// keeps the schema simpler if we ever lift the constraint.
ExperimentSchema.index({ planCode: 1, status: 1 });

export default mongoose.models.Experiment || mongoose.model('Experiment', ExperimentSchema);
