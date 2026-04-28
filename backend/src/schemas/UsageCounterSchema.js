import mongoose from 'mongoose';

/**
 * Per-user, per-day usage counter for daily-quota enforcement.
 *
 * `date` is a string in `YYYY-MM-DD` form computed in Asia/Kolkata so that
 * a user's "day" rolls over at IST midnight regardless of where the server
 * is hosted. Combined with userId it uniquely identifies a user-day; we
 * upsert with $inc to make increments atomic and race-safe.
 *
 * The TTL index expires documents 30 days after creation — counters are
 * write-heavy and we never need to read more than today's value, so we
 * keep the collection small.
 *
 * See backend/src/middleware/quotas.js for usage and the IST date helper.
 */
const UsageCounterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD' in IST
    loadsCreated: { type: Number, default: 0 },
    bidsPlaced: { type: Number, default: 0 },
  },
  { timestamps: true }
);

UsageCounterSchema.index({ userId: 1, date: 1 }, { unique: true });
// TTL: drop after 30 days; we only ever read today's row.
UsageCounterSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.models.UsageCounter || mongoose.model('UsageCounter', UsageCounterSchema);
