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

// 3.9 — הבדיקה הזאת **שכפלה** את הענף מה-route כדי לבדוק אותו, ולכן קיבעה
// אותו. `error === "access_denied" → "cancelled"` הוא בדיוק מה שהחביא קישור
// אישור שפג תוקפו: GoTrue מחזיר עליו את אותו access_denied ומניח את הסיבה
// ב-error_code בלבד, ו"ביטול" מציג בכוונה כלום — אז הסטודנט לחץ על הקישור
// מהמייל ונחת על מסך התחברות שותק לגמרי.
//
// הסיווג עבר לפונקציה אחת, והבדיקה **מייבאת** אותה. אין יותר שני מקורות.

import { describe, it, expect } from "vitest";
import { classifyCallback } from "@/lib/auth-callback-reason";

type Params = Record<string, string | undefined>;

const outcome = (p: Params, exchangeFails = false) => classifyCallback(p, exchangeFails);

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

  // ── 3.9 ──────────────────────────────────────────────────────────────
  describe("קישור מהמייל שפג תוקפו אינו ביטול", () => {
    it("otp_expired מסווג בנפרד — 'ביטול' היה מציג מסך שותק", () => {
      expect(
        outcome({ error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" }),
      ).toBe("expired");
    });

    it("גם בלי error_code, אם התיאור אומר שפג", () => {
      expect(outcome({ error: "access_denied", error_description: "Token has expired" })).toBe("expired");
    });

    it("קישור איפוס סיסמה שפג עובר באותו מסלול", () => {
      expect(outcome({ error: "access_denied", error_code: "otp_expired", type: "recovery" })).toBe("expired");
    });

    it("ביטול אמיתי נשאר ביטול — התיקון לא בלע אותו", () => {
      expect(outcome({ error: "access_denied", error_description: "The user denied the request" })).toBe("cancelled");
      expect(outcome({ error: "access_denied" })).toBe("cancelled");
    });

    it("שלושת המצבים שונים זה מזה — זו כל הנקודה", () => {
      const kinds = new Set([
        outcome({ error: "access_denied" }),
        outcome({ error: "access_denied", error_code: "otp_expired" }),
        outcome({ error: "server_error" }),
      ]);
      expect(kinds.size).toBe(3);
    });
  });
});