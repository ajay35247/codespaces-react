/**
 * Holds the running Redis client so other modules (alerts throttle, healing
 * queue book-keeping) can use it without a circular import.
 *
 * Mirrors the pattern of utils/socketBus.js.  Set once at startup; callers
 * must handle the `null` case (Redis is optional infra).
 */
let client = null;

export function setRedisClient(c) {
  client = c;
}

export function getRedisClient() {
  return client;
}

/**
 * Atomic SETNX-with-TTL — returns true if the lock was acquired (i.e. the
 * caller is the first within the window), false otherwise.  Used to throttle
 * admin alerts so a hot fingerprint doesn't spam the bell once a second.
 *
 * Falls back to an in-memory map when Redis is unavailable so single-instance
 * deployments still get throttling.
 */
const memoryLocks = new Map();

export async function acquireLock(key, ttlMs) {
  if (client?.isOpen) {
    try {
      const result = await client.set(key, '1', { NX: true, PX: ttlMs });
      return result === 'OK';
    } catch {
      // fall through to memory fallback
    }
  }
  const now = Date.now();
  const expiry = memoryLocks.get(key);
  if (expiry && expiry > now) return false;
  memoryLocks.set(key, now + ttlMs);
  // Light cleanup so the map doesn't grow unbounded.
  if (memoryLocks.size > 1000) {
    for (const [k, v] of memoryLocks) {
      if (v <= now) memoryLocks.delete(k);
    }
  }
  return true;
}
