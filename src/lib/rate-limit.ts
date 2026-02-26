/**
 * In-memory sliding-window rate limiter.
 *
 * Each key (typically the client IP) maintains a list of request timestamps.
 * Expired entries are pruned on every call to keep memory bounded.
 * Stale keys (with no recent timestamps) are removed periodically.
 */

const store = new Map<string, number[]>();

// Periodically prune stale keys (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function pruneStaleKeys(maxWindowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - maxWindowMs;
  for (const [key, timestamps] of store) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
}

/**
 * Check whether `key` is within the allowed rate.
 *
 * @param key       Identifier to rate-limit on (e.g. client IP).
 * @param limit     Maximum number of requests allowed in the window.
 * @param windowMs  Length of the sliding window in milliseconds.
 * @returns         `{ success, remaining }` — success is false when the limit
 *                  has been exceeded.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Periodically clean up stale keys
  pruneStaleKeys(windowMs);

  let timestamps = store.get(key) ?? [];

  // Prune entries outside the window
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    store.set(key, timestamps);
    return { success: false, remaining: 0 };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return { success: true, remaining: limit - timestamps.length };
}

/**
 * Extract a best-effort client IP from a Next.js request.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
