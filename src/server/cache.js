class TtlCache {
  constructor() {
    this._store = new Map();
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
      }
    }
  }

  clear() {
    this._store.clear();
  }

  get size() {
    return this._store.size;
  }
}

const globalCache = new TtlCache();

module.exports = {
  TtlCache,
  globalCache
};
