import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

// The limiter keeps one module-level Map, so every test uses a unique
// identifier — no cross-test state bleed, no reset hook needed.
let n = 0;
const uid = () => `test-${Date.now()}-${n++}`;

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the limit and decrements remaining", () => {
    const id = uid();
    const opts = { maxRequests: 3, windowSeconds: 60 };
    expect(checkRateLimit(id, opts)).toMatchObject({ allowed: true, remaining: 2 });
    expect(checkRateLimit(id, opts)).toMatchObject({ allowed: true, remaining: 1 });
    expect(checkRateLimit(id, opts)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("blocks the (max+1)th request with a positive reset countdown", () => {
    const id = uid();
    const opts = { maxRequests: 2, windowSeconds: 60 };
    checkRateLimit(id, opts);
    checkRateLimit(id, opts);
    const blocked = checkRateLimit(id, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetInSeconds).toBeGreaterThan(0);
  });

  it("opens a fresh window after the reset time passes", () => {
    vi.useFakeTimers();
    const id = uid();
    const opts = { maxRequests: 1, windowSeconds: 60 };
    expect(checkRateLimit(id, opts).allowed).toBe(true);
    expect(checkRateLimit(id, opts).allowed).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(id, opts).allowed).toBe(true);
  });

  it("gives independent budgets to distinct identifiers", () => {
    const a = uid();
    const b = uid();
    const opts = { maxRequests: 1, windowSeconds: 60 };
    expect(checkRateLimit(a, opts).allowed).toBe(true);
    expect(checkRateLimit(a, opts).allowed).toBe(false);
    // a's exhaustion must not affect b
    expect(checkRateLimit(b, opts).allowed).toBe(true);
  });
});
