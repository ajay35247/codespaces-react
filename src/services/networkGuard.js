/**
 * Network Guard — monitors connectivity, queues mutations while offline, and
 * replays them when connectivity is restored.
 *
 * - Heartbeat: pings `/api/health` every HEARTBEAT_MS so a transparent proxy
 *   that drops `navigator.onLine` to true while requests still time out is
 *   detected.
 * - Mutation queue: { method, path, body, idempotencyKey, attempts } stored
 *   in IndexedDB so a refresh while offline preserves the queue.  Replay on
 *   reconnect attaches `Idempotency-Key` so the server can dedup.
 *
 * Why no `idb-keyval` dep — adding a 1.4 KB dep for two operations is wasteful;
 * we use the IndexedDB API directly with a tiny promise wrapper.
 */

import { buildApiUrl } from '../utils/api';

const HEARTBEAT_MS = 20_000;
const DB_NAME = '__networkGuard';
const STORE = 'mutations';

let heartbeatTimer = null;
let isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
let lastHealthCheckOk = true;
const listeners = new Set();

function emit(state) {
  for (const l of listeners) {
    try { l(state); } catch { /* swallow */ }
  }
}

export function getNetworkState() {
  return { online: isOnline && lastHealthCheckOk };
}

export function subscribeNetwork(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function pingHealth() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(buildApiUrl('/health'), { method: 'GET', signal: ctrl.signal });
      lastHealthCheckOk = res.ok;
    } finally {
      clearTimeout(t);
    }
  } catch {
    lastHealthCheckOk = false;
  }
  emit(getNetworkState());
  if (lastHealthCheckOk && isOnline) {
    // Connection restored — kick off replay.
    replayQueue().catch(() => {});
  }
}

// ---------- IndexedDB tiny wrapper ----------

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const result = fn(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

function makeIdempotencyKey() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Queue a mutation for replay when connectivity returns.  Returns a promise
 * that resolves immediately once the request is in IDB — the actual replay
 * happens later.
 */
export async function queueMutation({ method, path, body }) {
  const entry = {
    method: String(method || 'POST').toUpperCase(),
    path: String(path || '/'),
    body: body !== undefined ? JSON.stringify(body) : null,
    idempotencyKey: makeIdempotencyKey(),
    attempts: 0,
    createdAt: Date.now(),
  };
  await tx('readwrite', (store) => store.add(entry));
  return { idempotencyKey: entry.idempotencyKey };
}

async function readQueue() {
  return tx('readonly', (store) => new Promise((resolve) => {
    const items = [];
    store.openCursor().onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) return resolve(items);
      items.push(cur.value);
      cur.continue();
    };
  }));
}

async function deleteEntry(id) {
  await tx('readwrite', (store) => store.delete(id));
}

let replaying = false;
async function replayQueue() {
  if (replaying) return;
  replaying = true;
  try {
    const items = (await readQueue()) || [];
    for (const entry of items) {
      if (entry.attempts >= 5) {
        await deleteEntry(entry.id);
        continue;
      }
      try {
        const res = await fetch(buildApiUrl(entry.path), {
          method: entry.method,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': entry.idempotencyKey,
          },
          body: entry.body || undefined,
        });
        if (res.ok || res.status === 409 /* conflict — already applied */) {
          await deleteEntry(entry.id);
        } else {
          await tx('readwrite', (store) => {
            store.put({ ...entry, attempts: entry.attempts + 1 });
          });
        }
      } catch {
        // Network died again mid-replay — leave entry, will retry on next heartbeat.
        break;
      }
    }
  } finally {
    replaying = false;
  }
}

export function initNetworkGuard() {
  if (typeof window === 'undefined') return;
  if (heartbeatTimer) return;
  window.addEventListener('online', () => {
    isOnline = true;
    emit(getNetworkState());
    pingHealth();
  });
  window.addEventListener('offline', () => {
    isOnline = false;
    emit(getNetworkState());
  });
  heartbeatTimer = setInterval(pingHealth, HEARTBEAT_MS);
  // Initial probe — non-blocking.
  pingHealth();
}
