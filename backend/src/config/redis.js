// Base delay (ms) and cap (ms) for ioredis exponential-backoff reconnects.
const RETRY_BASE_DELAY_MS = 100;
const RETRY_MAX_DELAY_MS = 3000;

/**
 * ioredis options shared by all Bull queues.
 *
 * - enableReadyCheck: false  — do not wait for the READY event before
 *   accepting commands; required for Bull on managed Redis (e.g. Railway,
 *   Upstash) where the ready check can race with TLS/auth negotiation.
 * - maxRetriesPerRequest: null — let Bull's own retry logic control retries
 *   rather than ioredis aborting commands after a fixed number of attempts.
 * - retryStrategy — exponential back-off capped at RETRY_MAX_DELAY_MS so
 *   transient ECONNRESET / network blips don't flood logs with rapid retries.
 */
export const bullRedisOpts = {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS),
};
