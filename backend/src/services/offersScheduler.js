import Offer from '../schemas/OfferSchema.js';
import { broadcast } from '../utils/socketBus.js';

/**
 * Auto-expire scheduler.
 *
 * Every CHECK_INTERVAL_MS, find offers whose end-time has passed but are
 * still flagged enabled, flip their `enabled` to false, and broadcast a
 * single `offers:changed` event so any open pricing pages refresh.
 *
 * Implemented with setInterval (no new dependency). The interval handle
 * is returned so tests can clear it; production calls just let it run for
 * the lifetime of the worker.
 *
 * Idempotent — if no offers expired the call is a no-op write and emits
 * nothing.
 */
const CHECK_INTERVAL_MS = 60 * 1000;
// Run the first scan shortly after startup so a freshly-restarted worker
// catches up on offers that expired while it was down, without blocking boot.
const INITIAL_DELAY_MS = 5000;

let intervalHandle = null;

async function expireDueOffers() {
  try {
    const now = new Date();
    const result = await Offer.updateMany(
      { enabled: true, endsAt: { $lte: now } },
      { $set: { enabled: false } }
    );
    if (result.modifiedCount > 0) {
      broadcast('offers:changed', { reason: 'auto-expired', at: now.toISOString() });
    }
  } catch (err) {
    // Never crash the worker on a scheduled tick — log and try again next interval.
    // eslint-disable-next-line no-console
    console.warn('Offer auto-expire tick failed:', err.message);
  }
}

export function startOfferScheduler() {
  if (intervalHandle) return intervalHandle;
  // Run once shortly after startup so freshly-restarted workers catch up
  // on offers that expired while they were down.
  setTimeout(expireDueOffers, INITIAL_DELAY_MS).unref();
  intervalHandle = setInterval(expireDueOffers, CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
  return intervalHandle;
}

export function stopOfferScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
