/** Tiny in-process TTL cache. Good enough for one server instance; swap for Redis if scaled out. */
export class TtlCache {
  constructor({ ttlMs, maxEntries = 1000 }) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.map.size >= this.maxEntries) {
      // Evict the oldest insertion (Map preserves insertion order).
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Returns the cached value or computes, caches and returns it. Concurrent callers share one promise. */
  async wrap(key, fn, ttlMs) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const promise = fn();
    this.set(key, promise, ttlMs);
    try {
      return await promise;
    } catch (err) {
      this.map.delete(key); // never cache failures
      throw err;
    }
  }

  clear() {
    this.map.clear();
  }
}
