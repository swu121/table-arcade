// Sliding window over timestamps, keyed by whatever the caller likes: an IP,
// a room, a venue. `hit` records an attempt and says whether it was over the
// line. Pairing-code guesses and staff logins share it.

export const DEFAULT_LIMIT = 10
export const DEFAULT_WINDOW = 60_000

export function createRateLimiter({ limit = DEFAULT_LIMIT, window = DEFAULT_WINDOW } = {}) {
  const hits = new Map()
  return {
    hit(key, now = Date.now()) {
      const list = (hits.get(key) ?? []).filter((at) => now - at < window)
      list.push(now)
      hits.set(key, list)
      return list.length > limit
    },
    // Keys nobody has touched for a window are dropped, so a busy night does
    // not grow the map forever.
    sweep(now = Date.now()) {
      for (const [key, list] of hits) {
        if (!list.some((at) => now - at < window)) hits.delete(key)
      }
    }
  }
}
