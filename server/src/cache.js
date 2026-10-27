'use strict';

/**
 * Tiny in-memory TTL cache for expensive read endpoints (overview, lists).
 * Reads are the hot path against slow/remote clusters; every cache holds
 * data only for a few seconds and is cleared on any successful mutation,
 * so reads-after-write are always fresh.
 */

function createCache(ttlMs, maxEntries = 200) {
  const store = new Map(); // key -> { value, expires }
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value);
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}

module.exports = { createCache };
