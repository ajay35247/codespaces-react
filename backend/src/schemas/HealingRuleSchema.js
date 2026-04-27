import mongoose from 'mongoose';

/**
 * HealingRule — admin-configurable auto-actions to take when a known error
 * fingerprint or pattern recurs.  Used by services/alerts.js when an error's
 * count crosses a threshold to optionally apply a self-heal action.
 *
 * matchPattern: regex (string) tested against the ErrorEvent message+stack.
 *               If empty, only fingerprintMatch is used.
 * fingerprintMatch: exact fingerprint match (preferred — cheap to evaluate).
 * action: one of the supported healing actions.
 * cooldownMs: minimum interval between successive applications of this rule.
 */
const HealingRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 200 },
    enabled: { type: Boolean, default: true, index: true },
    fingerprintMatch: { type: String, default: '', index: true, maxlength: 128 },
    matchPattern: { type: String, default: '', maxlength: 500 },
    action: {
      type: String,
      enum: ['reload_route', 'clear_cache_key', 'kill_switch_flag', 'rollback_release', 'soft_restart'],
      required: true,
    },
    actionParams: { type: mongoose.Schema.Types.Mixed, default: null },
    cooldownMs: { type: Number, default: 5 * 60 * 1000 },
    lastAppliedAt: { type: Date, default: null },
    appliedCount: { type: Number, default: 0 },
    createdByEmail: { type: String, default: '', maxlength: 200 },
    notes: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

export default mongoose.model('HealingRule', HealingRuleSchema);
