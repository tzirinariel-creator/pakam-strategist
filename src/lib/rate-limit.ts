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
  /**
   * כמה יחידות הבקשה הזאת **באמת** צורכת. ברירת המחדל 1.
   *
   * אריאל אישר, 4.9: *"מכסת הסריקות: לחייב 3 במונה. **לא** להוריד את
   * המגבלות."*
   *
   * הרקע: `scan-grades` קורא ל-Gemini **שלוש פעמים** (קריאה, אימות
   * צולב, ומפקד שורות) והמונה ספר אחת. עם 10 סריקות למשתמש ליום ו-150
   * גלובלי, המשמעות הייתה עד 450 קריאות בפועל מול מכסה חינמית של
   * ~1,000 שמשותפת גם למלך. המספר במונה פשוט לא אמר את האמת.
   *
   * החיוב הנכון גורם לשומר שלנו להיעצר **לפני** שגוגל עוצרת — כלומר
   * הסטודנט מקבל את ההודעה הנכונה שלנו במקום כשל אטום משם.
   */
  cost?: number;
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

  const cost = Math.max(1, options.cost ?? 1);

  if (!existing || now > existing.resetTime) {
    // New window
    rateLimitMap.set(key, { count: cost, resetTime: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, options.maxRequests - cost),
      resetInSeconds: options.windowSeconds,
    };
  }

  // נבדק מול העלות המלאה: בקשה ששווה 3 לא תתחיל כשנשארו 2, כי היא
  // תשרוף אצל גוגל שלוש קריאות בכל מקרה.
  if (existing.count + cost > options.maxRequests) {
    return {
      allowed: false,
      remaining: Math.max(0, options.maxRequests - existing.count),
      resetInSeconds: Math.ceil((existing.resetTime - now) / 1000),
    };
  }

  existing.count += cost;
  return {
    allowed: true,
    remaining: Math.max(0, options.maxRequests - existing.count),
    resetInSeconds: Math.ceil((existing.resetTime - now) / 1000),
  };
}
