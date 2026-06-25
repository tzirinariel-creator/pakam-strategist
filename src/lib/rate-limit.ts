/**
 * Simple in-memory rate limiter for serverless functions.
 * Works on Vercel — each instance maintains its own Map.
 * For 50 users this is sufficient; for larger scale, use Upstash Redis.
 *
 * Uses lazy cleanup instead of setInterval (which is unreliable
 * in serverless environments where instances are ephemeral).
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();

/** Lazy cleanup: purge stale entries at most once per 5 minutes. */
function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < 5 * 60 * 1000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

interface RateLimitOptions {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  cleanupStaleEntries();

  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const key = identifier;

  const existing = rateLimitMap.get(key);

  if (!existing || now > existing.resetTime) {
    // New window
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetInSeconds: options.windowSeconds,
    };
  }

  if (existing.count >= options.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((existing.resetTime - now) / 1000),
    };
  }

  existing.count++;
  return {
    allowed: true,
    remaining: options.maxRequests - existing.count,
    resetInSeconds: Math.ceil((existing.resetTime - now) / 1000),
  };
}
