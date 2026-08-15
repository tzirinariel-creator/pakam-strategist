// The demo account is read-only by design, so its writes are REFUSED — not
// broken. Onboarding used to render every failure as "כנראה בעיית חיבור.
// רעננו ונסו שוב", which sends a demo user to debug a network problem they
// don't have and hides the one action that would work: sign up.
import { describe, it, expect } from "vitest";
import { isDemoRefusal } from "@/lib/demo-refusal";
import { DEMO_READONLY_MESSAGE } from "@/server/trpc/demo";

describe("isDemoRefusal", () => {
  it("recognises the guard's own message", () => {
    expect(isDemoRefusal(new Error(DEMO_READONLY_MESSAGE))).toBe(true);
  });

  it("recognises it when a wrapper has prefixed the message", () => {
    // tRPC/react-query wrap errors; the text travels but the shape doesn't.
    expect(isDemoRefusal(new Error(`TRPCClientError: ${DEMO_READONLY_MESSAGE}`))).toBe(true);
  });

  it("accepts a bare string and a plain object with a message", () => {
    expect(isDemoRefusal(DEMO_READONLY_MESSAGE)).toBe(true);
    expect(isDemoRefusal({ message: DEMO_READONLY_MESSAGE })).toBe(true);
  });

  it("is FALSE for a real failure — those keep the retry advice", () => {
    expect(isDemoRefusal(new Error("fetch failed"))).toBe(false);
    expect(isDemoRefusal(new Error("UNAUTHORIZED"))).toBe(false);
    expect(isDemoRefusal(new Error(""))).toBe(false);
  });

  it("never throws on null/undefined/odd input", () => {
    expect(isDemoRefusal(null)).toBe(false);
    expect(isDemoRefusal(undefined)).toBe(false);
    expect(isDemoRefusal(42)).toBe(false);
    expect(isDemoRefusal({})).toBe(false);
  });
});
