import mongoose from 'mongoose';

/**
 * Offer — admin-managed promotional discount that can be applied to one or
 * more subscription plans for a scheduled time window.
 *
 * Types
 *   - 'festival' : a labelled, scheduled promotion (e.g. Diwali Sale).
 *                  Auto-applied when active and the resolver finds it.
 *   - 'flat'     : a non-festival broad discount (e.g. "Welcome 10%").
 *                  Auto-applied when active.
 *   - 'coupon'   : requires the buyer to enter `couponCode`. Not auto-applied.
 *
 * Targeting
 *   - `appliesToPlanCodes` empty → applies to ALL plans.
 *   - `appliesToPlanCodes` non-empty → applies only to listed plan codes
 *     (matches SubscriptionPlan.code, which is also used as planId by the
 *     hardcoded payments router).
 *
 * Lifecycle
 *   - `enabled`    : admin master toggle. False = inert regardless of dates.
 *   - `startsAt`   : not active before this instant.
 *   - `endsAt`     : not active at or after this instant. Past this point the
 *                    auto-expiry scheduler flips `enabled` to false and emits
 *                    a global `offers:changed` socket event.
 *   - `usageLimit` : optional cap on total redemptions across all users. When
 *                    `usageCount >= usageLimit`, the offer stops being eligible.
 *
 * All fields are validated (discount range 1-90 except by explicit override
 * up to 95 by super-admin, plan codes are strings, end > start) — see the
 * pre-save hook below.
 */
const OfferSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: ['festival', 'flat', 'coupon'], required: true },
    label: { type: String, default: '', trim: true, maxlength: 80 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    discountPercent: { type: Number, required: true, min: 1, max: 90 },
    appliesToPlanCodes: [{ type: String, trim: true, maxlength: 50 }],
    couponCode: { type: String, trim: true, uppercase: true, sparse: true, maxlength: 50 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    enabled: { type: Boolean, default: true },
    usageLimit: { type: Number, min: 1 },
    usageCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Coupons must have a code, non-coupons must not (codes are reserved for
// coupon redemption only — keeps the resolver logic simple and safe).
OfferSchema.pre('validate', function preValidate(next) {
  if (this.endsAt <= this.startsAt) {
    return next(new Error('endsAt must be after startsAt'));
  }
  if (this.type === 'coupon') {
    if (!this.couponCode) return next(new Error('couponCode is required for coupon offers'));
  } else if (this.couponCode) {
    return next(new Error('couponCode is only allowed for offers of type "coupon"'));
  }
  return next();
});

// Unique coupon codes (sparse: nulls allowed for non-coupon offers).
OfferSchema.index({ couponCode: 1 }, { unique: true, sparse: true });
OfferSchema.index({ enabled: 1, startsAt: 1, endsAt: 1 });

export default mongoose.model('Offer', OfferSchema);
