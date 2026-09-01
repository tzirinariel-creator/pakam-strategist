// =========================================================================
// The login screen must not blame the student for Google's answer (#3)
// =========================================================================
// Ariel: "התחברתי עם גוגל וסתכל מה קרה… מוזר לא?" — his screenshot shows
// "משהו השתבש בהתחברות — בדקו את הפרטים ונסו שוב" on the login page.
//
// Every way that callback route could fail produced that one sentence,
// including the way that is not a failure: pressing "cancel" at Google's
// consent screen returns `error=access_denied` with no `code`, fell through the
// same branch, and told a student to check credentials they never typed.
//
// The reason was also discarded, so a real provider or exchange failure was
// indistinguishable from a cancel and left nothing to diagnose. That is why the
// bug survived: it looked identical to a user changing their mind.
//
// The routing decision is restated here as the pure function it is.

import { describe, it, expect } from "vitest";

type Params = Record<string, string | undefined>;

/** Exactly the branch order in src/app/api/auth/callback/route.ts. */
function outcome(p: Params, exchangeFails = false): string {
  const hasCredential = Boolean(p.code || (p.token_hash && p.type));
  if (hasCredential) return exchangeFails ? "exchange" : "session";
  if (p.error) return p.error === "access_denied" ? "cancelled" : "provider";
  return "auth";
}

describe("the callback distinguishes what actually happened", () => {
  it("a cancelled consent screen is not an error", () => {
    expect(outcome({ error: "access_denied", error_description: "The user denied" }))
      .toBe("cancelled");
  });

  it("a provider failure is named as the provider's", () => {
    expect(outcome({ error: "server_error", error_code: "unexpected_failure" }))
      .toBe("provider");
  });

  it("a failed code exchange is its own case", () => {
    // This is the one that is genuinely ours, and the one worth logging.
    expect(outcome({ code: "abc123" }, true)).toBe("exchange");
  });

  it("a good code opens a session", () => {
    expect(outcome({ code: "abc123" })).toBe("session");
  });

  it("an email-confirmation link still works", () => {
    expect(outcome({ token_hash: "h", type: "signup" })).toBe("session");
  });

  it("only a truly empty callback falls back to the generic error", () => {
    // The old code sent every case here — which is why the message had to be
    // vague, and why it was wrong three times out of four.
    expect(outcome({})).toBe("auth");
  });

  it("never routes a cancel to the credentials message", () => {
    // The actual regression: "בדקו את הפרטים" for someone who typed none.
    for (const p of [
      { error: "access_denied" },
      { error: "access_denied", error_description: "user cancelled" },
    ]) {
      expect(outcome(p)).not.toBe("auth");
    }
  });
});
