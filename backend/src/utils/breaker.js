/**
 * Lightweight in-process circuit breaker for outbound calls.
 *
 * States:
 *   closed      — calls pass through, failures counted
 *   open        — calls rejected immediately for `resetTimeoutMs`
 *   half-open   — single trial call allowed; success closes, failure re-opens
 *
 * No external dependency (avoids pulling `opossum` for ~200 LOC of logic).
 *
 * Usage:
 *   const breaker = new CircuitBreaker({ name: 'razorpay', failureThreshold: 5 });
 *   const result = await breaker.exec(() => razorpayCall());
 *   if (result.fallback) ... // breaker is open, use fallback path
 */
export class CircuitBreaker {
  constructor({
    name = 'default',
    failureThreshold = 5,
    resetTimeoutMs = 30 * 1000,
    rollingWindowMs = 60 * 1000,
    onStateChange = null,
  } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.rollingWindowMs = rollingWindowMs;
    this.onStateChange = onStateChange;
    this.state = 'closed';
    this.failures = []; // timestamps within rolling window
    this.openedAt = 0;
    this.totalSuccesses = 0;
    this.totalFailures = 0;
    this.totalShortCircuits = 0;
  }

  _setState(next) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    if (next === 'open') this.openedAt = Date.now();
    if (typeof this.onStateChange === 'function') {
      try { this.onStateChange(prev, next, this.name); } catch { /* swallow */ }
    }
  }

  _pruneFailures(now) {
    const cutoff = now - this.rollingWindowMs;
    while (this.failures.length && this.failures[0] < cutoff) {
      this.failures.shift();
    }
  }

  /**
   * Execute `fn` (an async function). Resolves to:
   *   { ok: true, value }            on success
   *   { ok: false, error }           on caller failure
   *   { ok: false, fallback: true }  when the breaker rejected the call
   */
  async exec(fn) {
    const now = Date.now();
    if (this.state === 'open') {
      if (now - this.openedAt < this.resetTimeoutMs) {
        this.totalShortCircuits += 1;
        return { ok: false, fallback: true };
      }
      this._setState('half-open');
    }
    try {
      const value = await fn();
      this.totalSuccesses += 1;
      if (this.state === 'half-open') {
        this.failures = [];
        this._setState('closed');
      }
      return { ok: true, value };
    } catch (error) {
      this.totalFailures += 1;
      this._pruneFailures(now);
      this.failures.push(now);
      if (this.state === 'half-open' || this.failures.length >= this.failureThreshold) {
        this._setState('open');
      }
      return { ok: false, error };
    }
  }

  snapshot() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures.length,
      successes: this.totalSuccesses,
      totalFailures: this.totalFailures,
      shortCircuits: this.totalShortCircuits,
      openedAt: this.openedAt || null,
    };
  }
}

const registry = new Map();

export function getBreaker(name, options = {}) {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker({ name, ...options }));
  }
  return registry.get(name);
}

export function listBreakers() {
  return Array.from(registry.values()).map((b) => b.snapshot());
}
