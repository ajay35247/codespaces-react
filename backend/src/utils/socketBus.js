// Tiny module that holds the running socket.io `Server` instance so that
// route handlers (which are imported before startWorker() creates io) can
// emit events into user rooms without a circular import.
//
// Usage:
//   // once, at startup:
//   setIo(io);
//   // anywhere else:
//   emitToUser(userId, 'notification', payload);

let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  return ioInstance;
}

/**
 * Emit `event` with `payload` to a single user's personal room.  Each
 * authenticated socket joins `socket.user.id` on connect (see index.js),
 * so this reaches all of that user's open tabs / devices.
 *
 * Silently no-ops when io is not yet initialised (e.g. during tests that
 * import route modules without starting the worker) — we never want a
 * notification emit to crash the originating request.
 */
export function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  try {
    ioInstance.to(String(userId)).emit(event, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('emitToUser failed:', err.message);
  }
}

/**
 * Broadcast `event` with `payload` to every connected socket.
 * Used for global state changes (e.g. an offer expiring) so that all open
 * pricing pages can refresh themselves without polling.
 *
 * Silently no-ops when io is not yet initialised so callers don't have to
 * guard against the test/import-only case.
 */
export function broadcast(event, payload) {
  if (!ioInstance || !event) return;
  try {
    ioInstance.emit(event, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('broadcast failed:', err.message);
  }
}
