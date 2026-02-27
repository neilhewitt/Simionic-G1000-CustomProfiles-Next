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
 *
 * DEPLOYMENT REQUIREMENT: Set the `TRUST_PROXY=true` environment variable only
 * when the app is deployed behind a trusted reverse proxy (e.g. Vercel,
 * Cloudflare, or an Nginx/ALB proxy) that strips or overwrites the
 * `x-forwarded-for` header before it reaches the application. Without a
 * trusted proxy, an attacker can bypass rate limiting by rotating spoofed
 * header values with each request.
 *
 * When `TRUST_PROXY` is not set to `"true"`, the function returns `"unknown"`,
 * which causes all unauthenticated requests to share the same rate-limit
 * bucket — a safe default that avoids IP-spoofing bypass.
 *
 * @param request     The incoming Next.js request.
 * @param trustProxy  Whether to trust proxy headers. Defaults to the value of
 *                    the `TRUST_PROXY` environment variable.
 */
export function getClientIp(
  request: Request,
  trustProxy = process.env.TRUST_PROXY === "true"
): string {
  if (!trustProxy) return "unknown";

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
