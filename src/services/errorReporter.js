/**
 * Error reporter — captures errors, breadcrumbs, and posts batches to the
 * backend `/api/telemetry/errors` endpoint.
 *
 * Design goals
 *   - No external dependency (no Sentry SDK).
 *   - Lightweight: < 6 KB gzip in the bundle.
 *   - Never crash the host app — every public method is fail-safe.
 *   - Never leak PII: stack/message only; request bodies are stripped at the
 *     api.js layer before they reach the breadcrumb buffer.
 *   - Survives page unload via sendBeacon when supported.
 *
 * URL construction is intentionally inlined (not imported from utils/api) so
 * the reporter has no circular dependency with api.js — the api layer can
 * dynamically import this module to report failed requests without creating
 * a chunk-graph cycle.
 */

const MAX_BREADCRUMBS = 30;
const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 10_000;
const MAX_PAYLOAD_BYTES = 60_000; // sendBeacon caps at ~64 KB on most browsers

const PII_KEY_PATTERN = /(password|token|authorization|cookie|secret|otp|csrf|cardnumber|cvv|pan|aadhaar)/i;

const breadcrumbs = []; // ring buffer
const queue = [];
let initialised = false;
let flushTimer = null;
let lastFlushAt = 0;
let sessionId = '';

function getTelemetryUrl() {
  const base = String(import.meta.env?.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const root = base.endsWith('/api') ? base : `${base}/api`;
  return `${root}/telemetry/errors`;
}

function safeNow() {
  try { return Date.now(); } catch { return 0; }
}

function makeSessionId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `s-${Math.random().toString(36).slice(2)}-${safeNow()}`;
}

function getSessionId() {
  if (sessionId) return sessionId;
  try {
    const stored = sessionStorage.getItem('__err_sid');
    if (stored) {
      sessionId = stored;
      return sessionId;
    }
    sessionId = makeSessionId();
    sessionStorage.setItem('__err_sid', sessionId);
  } catch {
    sessionId = makeSessionId();
  }
  return sessionId;
}

/** Strip values whose keys look like credentials from a shallow object. */
function scrubObject(input) {
  if (!input || typeof input !== 'object') return input;
  const out = Array.isArray(input) ? [] : {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof k === 'string' && PII_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      out[k] = scrubObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function addBreadcrumb(kind, data) {
  try {
    const crumb = {
      t: safeNow(),
      kind: String(kind || 'log').slice(0, 32),
      data: typeof data === 'string'
        ? data.slice(0, 500)
        : JSON.stringify(scrubObject(data) || '').slice(0, 500),
    };
    breadcrumbs.push(crumb);
    if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
  } catch {
    // never bubble
  }
}

function currentRoute() {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return '';
  }
}

function getReleaseSha() {
  try {
    return import.meta.env?.VITE_GIT_SHA || '';
  } catch {
    return '';
  }
}

function buildEvent({ message, stack, severity = 'error', type = 'unknown', componentStack = '' } = {}) {
  return {
    type: String(type).slice(0, 64),
    severity,
    message: String(message || '').slice(0, 2000),
    stack: String(stack || '').slice(0, 16000),
    componentStack: String(componentStack || '').slice(0, 8000),
    route: currentRoute(),
    releaseSha: getReleaseSha(),
    userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 500) : '',
    breadcrumbs: breadcrumbs.slice(-MAX_BREADCRUMBS),
    sessionId: getSessionId(),
  };
}

function enqueue(event) {
  queue.push(event);
  if (queue.length > MAX_QUEUE) {
    // drop oldest — preserve newest information.
    queue.splice(0, queue.length - MAX_QUEUE);
  }
}

function whenIdle(fn) {
  if (typeof window === 'undefined') return fn();
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(fn, { timeout: 2000 });
  }
  return setTimeout(fn, 0);
}

async function flush({ useBeacon = false } = {}) {
  if (queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const payload = JSON.stringify({ events });

  // Drop events that exceed the beacon cap rather than partially send.
  if (payload.length > MAX_PAYLOAD_BYTES && useBeacon) {
    return;
  }

  const url = getTelemetryUrl();
  lastFlushAt = safeNow();

  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    // Use fetch with keepalive so the request survives navigation in modern
    // browsers.  Failures are silently dropped — telemetry is best-effort.
    await fetch(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
  } catch {
    // Re-enqueue on failure with cap to prevent unbounded growth.
    if (events.length + queue.length <= MAX_QUEUE) {
      queue.unshift(...events);
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    whenIdle(() => flush());
  }, FLUSH_INTERVAL_MS);
}

/**
 * Publicly capture an error.  Accepts an Error instance, a thrown value, or
 * a structured event.  Always non-throwing.
 */
export function captureError(input, extra = {}) {
  try {
    let evt;
    if (input instanceof Error) {
      evt = buildEvent({
        message: input.message,
        stack: input.stack,
        type: extra.type || input.name || 'Error',
        severity: extra.severity,
        componentStack: extra.componentStack,
      });
    } else if (typeof input === 'string') {
      evt = buildEvent({ message: input, ...extra });
    } else if (input && typeof input === 'object') {
      evt = buildEvent({
        message: input.message || String(input.reason || ''),
        stack: input.stack || '',
        type: input.type || extra.type,
        severity: input.severity || extra.severity,
        componentStack: input.componentStack || extra.componentStack,
      });
    } else {
      return;
    }
    enqueue(evt);
    scheduleFlush();
  } catch {
    // never bubble
  }
}

/**
 * Initialise global error hooks.  Idempotent — call from src/index.jsx.
 *
 * Hooks installed:
 *   - window.onerror              uncaught synchronous errors
 *   - onunhandledrejection        async errors
 *   - pagehide / visibilitychange flush via beacon before unload
 */
export function initErrorReporter() {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;
  getSessionId();

  window.addEventListener('error', (event) => {
    captureError(event.error || event.message, { type: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    captureError(reason instanceof Error ? reason : { message: String(reason ?? 'unhandled rejection'), reason }, {
      type: 'unhandledrejection',
    });
  });

  const beaconFlush = () => {
    try { flush({ useBeacon: true }); } catch { /* swallow */ }
  };
  window.addEventListener('pagehide', beaconFlush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beaconFlush();
  });

  // Periodic background flush (idle-callback so we never block UI).
  setInterval(() => whenIdle(() => flush()), FLUSH_INTERVAL_MS);
}

export const __test = { breadcrumbs, queue, scrubObject, getLastFlushAt: () => lastFlushAt };
