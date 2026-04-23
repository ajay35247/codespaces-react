import mongoose from 'mongoose';

/**
 * A single message in a trip-scoped chat thread.
 *
 * Access is restricted by the chat route to participants of the load:
 * the posting shipper, the assigned driver, and any broker who placed a bid.
 * Messages are kept inline (no object-storage attachment), text only, with a
 * 2 KB cap per message to stay within MongoDB document limits.
 */
const ChatMessageSchema = new mongoose.Schema({
  loadId: { type: String, required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true, maxlength: 120 },
  senderRole: {
    type: String,
    enum: ['shipper', 'driver', 'broker', 'truck_owner', 'admin'],
    required: true,
  },
  text: { type: String, required: true, maxlength: 2000 },
  messageType: { type: String, enum: ['text', 'system'], default: 'text' },
  createdAt: { type: Date, default: Date.now },
});

// Compound index for efficient per-load pagination sorted by time.
ChatMessageSchema.index({ loadId: 1, createdAt: -1 });

export default mongoose.model('ChatMessage', ChatMessageSchema);
