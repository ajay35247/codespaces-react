import mongoose from 'mongoose';

// Notification delivered to a single user.  Written by services/notifications.js
// `notify()` which also pushes a socket.io event to the user's personal room
// (each authenticated socket auto-joins `socket.user.id` — see index.js).
//
// `type` is a free-form short code used by the UI to route / badge:
//   bid:placed        — new bid received on your load
//   bid:accepted      — your bid was accepted
//   load:status       — load moved to a new status
//   load:pod          — POD submitted on your load
//   payment:released  — shipper released payment on delivered load
//   payment:received  — driver acknowledged receipt
//   escrow:funded     — escrow funds held for load
//   kyc:approved      — admin approved your KYC
//   kyc:rejected      — admin rejected your KYC
const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, maxlength: 64 },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, default: '', maxlength: 1000 },
  link: { type: String, default: '', maxlength: 500 },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
});

// Compound index drives the primary list query (by user, newest first).
NotificationSchema.index({ userId: 1, createdAt: -1 });
// Separate index for the unread-count badge query.
NotificationSchema.index({ userId: 1, readAt: 1 });

export default mongoose.model('Notification', NotificationSchema);
