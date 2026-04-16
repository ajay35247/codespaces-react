import mongoose from 'mongoose';

const AutomationRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: true },
    trigger: {
      type: {
        type: String,
        enum: ['truck-idle', 'price-low', 'demand-high', 'custom-metric'],
        required: true,
      },
      threshold: { type: Number, required: true },
      unit: { type: String, required: true },
      scope: { type: String },
    },
    action: {
      type: {
        type: String,
        enum: ['send-alert', 'suggest-price-increase', 'increase-commission', 'freeze-account', 'custom'],
        required: true,
      },
      payload: { type: mongoose.Schema.Types.Mixed },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastTriggeredAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('AutomationRule', AutomationRuleSchema);
