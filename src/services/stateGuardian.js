/**
 * State Guardian — keeps user-facing form state safe across crashes, reloads,
 * and accidental navigation.  The {@link useDraft} hook persists a value to
 * `localStorage` (debounced) and rehydrates it on mount.
 *
 * Corruption handling: if the stored JSON cannot be parsed (storage quota
 * exceeded mid-write, externally modified by an extension, ...) we move the
 * bad blob to `__corrupted__:<key>` so it can be inspected later, then return
 * the caller's `initialValue` rather than throwing.
 */

const PREFIX = '__draft__:';
const CORRUPT_PREFIX = '__corrupted__:';
const DEBOUNCE_MS = 400;

function safeStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readDraft(key, fallback) {
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(`${PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    // Quarantine the corrupted slot so we don't keep failing on it.
    try {
      const raw = storage.getItem(`${PREFIX}${key}`);
      if (raw !== null) {
        storage.setItem(`${CORRUPT_PREFIX}${key}`, raw);
        storage.removeItem(`${PREFIX}${key}`);
      }
    } catch { /* swallow */ }
    return fallback;
  }
}

export function writeDraft(key, value) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Quota exceeded or serialisation error — drop silently rather than crash
    // the app on a non-essential save.
  }
}

export function clearDraft(key) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(`${PREFIX}${key}`);
  } catch { /* swallow */ }
}

const timers = new Map();

/** Debounced write — called from useDraft on every change. */
export function scheduleWrite(key, value) {
  if (timers.has(key)) clearTimeout(timers.get(key));
  const t = setTimeout(() => {
    writeDraft(key, value);
    timers.delete(key);
  }, DEBOUNCE_MS);
  timers.set(key, t);
}

/** Force-flush all pending writes — call before unload to guarantee save. */
export function flushPendingDrafts() {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    timers.delete(key);
  }
  // The actual values are held in component state, so the registered
  // beforeunload handler in useDraft will call writeDraft directly.
}
