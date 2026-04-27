import mongoose from 'mongoose';

/**
 * SearchEvent — analytics row written on every `/search` call (and on
 * result clicks via `POST /search/event`).  Powers:
 *   - "Recently searched" + "Recently viewed loads" personalisation
 *   - `GET /search/trending` (admin + public-trending)
 *   - Admin "most searched routes" table
 *
 * Documents auto-expire 60 days after `createdAt` so the analytics window is
 * bounded and we never accumulate unbounded PII.  When `userId` is absent
 * the event is from an anonymous visitor — we still log the route shape but
 * never anything that could re-identify them.
 */
const SearchEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    role: { type: String, default: null },
    query: { type: String, default: '', maxlength: 120 },
    // Normalised origin / destination pulled from the route parser so the
    // trending aggregation is a clean group-by even if users typed slightly
    // different things ("Delhi to Mumbai" vs "delhi → mumbai").
    fromNormalised: { type: String, default: '' },
    toNormalised: { type: String, default: '' },
    filters: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    resultsCount: { type: Number, default: 0 },
    clickedLoadId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// TTL index — Mongo deletes documents 60 days after their createdAt.
SearchEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
// Trending aggregation: group by (fromNormalised, toNormalised) restricted
// to the last 7 days.  This compound index makes that group fast.
SearchEventSchema.index({ createdAt: -1, fromNormalised: 1, toNormalised: 1 });
// Per-user history listing.
SearchEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('SearchEvent', SearchEventSchema);
