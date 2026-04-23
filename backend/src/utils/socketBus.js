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
