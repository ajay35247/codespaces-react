import mongoose from 'mongoose';

/**
 * ErrorEvent — fingerprint-keyed dedup of every captured client/server error.
 *
 * Writes use upsert with $inc on `count` and $set on `lastSeen` so a recurring
 * error stays as a single document rather than flooding the collection.  A TTL
 * index on `expiresAt` (default 30 days from lastSeen) prunes resolved/old data.
 *
 * `fingerprint` is a sha256 of the normalised error stack (trimmed of paths,
 * line numbers, and absolute URLs) — see services/errorFingerprint.js.
 */
const ErrorEventSchema = new mongoose.Schema(
  {
    fingerprint: { type: String, required: true, index: true, unique: true, maxlength: 128 },
    type: { type: String, default: 'unknown', maxlength: 64 },
    severity: {
      type: String,
      enum: ['fatal', 'error', 'warning', 'info'],
      default: 'error',
      index: true,
    },
    message: { type: String, default: '', maxlength: 2000 },
    stack: { type: String, default: '', maxlength: 16000 },
    componentStack: { type: String, default: '', maxlength: 8000 },
    route: { type: String, default: '', maxlength: 500 },
    releaseSha: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 500 },
    breadcrumbs: { type: mongoose.Schema.Types.Mixed, default: null },
    affectedUsers: { type: [String], default: [] },
    affectedSessions: { type: [String], default: [] },
    count: { type: Number, default: 1, index: true },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now, index: true },
    status: {
      type: String,
      enum: ['open', 'auto_healed', 'resolved', 'silenced'],
      default: 'open',
      index: true,
    },
    recurring: { type: Boolean, default: false, index: true },
    autoHealAttempts: { type: Number, default: 0 },
    notes: { type: String, default: '', maxlength: 2000 },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

// TTL index — Mongo will prune documents 0s after `expiresAt`.
ErrorEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
ErrorEventSchema.index({ status: 1, lastSeen: -1 });
ErrorEventSchema.index({ route: 1, lastSeen: -1 });

export default mongoose.model('ErrorEvent', ErrorEventSchema);
