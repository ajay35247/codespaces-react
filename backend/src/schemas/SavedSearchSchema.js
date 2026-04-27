import mongoose from 'mongoose';

/**
 * SavedSearch — a user-named snapshot of a search query + filter set.
 *
 * Only the saver can list / delete their own saved searches.  Filters are
 * stored as a sanitised plain object (the search route validates them with
 * Joi before persisting) — never trust this document as the source of
 * truth for price / role / status; always re-validate on read.
 */
const SavedSearchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    query: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

// Stable per-user uniqueness: a user can't have two saved searches with the
// exact same name.  Casing-sensitive by design — lets users distinguish
// "Mumbai trips" from "Mumbai Trips" if they want to.
SavedSearchSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('SavedSearch', SavedSearchSchema);
