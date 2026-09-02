// =========================================================================
// The client threw away the one sentence that was true
// =========================================================================
// Found by pressing "שמרו פרופיל" on the demo account. The server said
// "זהו חשבון הדגמה — הירשמו כדי לשמור תוכנית משלכם"; the screen said
// "לא הצלחנו לעדכן את הפרופיל — נסו שוב". Trying again would never work.
// Seventeen onError handlers did the same, so every save on a demo account
// failed with a shrug.

import { describe, it, expect } from "vitest";
import { serverSaid } from "@/lib/server-said";

const FALLBACK = "לא הצלחנו לשמור — נסו שוב. שום דבר לא אבד.";
const trpc = (code: string, message: string) => ({ message, data: { code } });

describe("a deliberate server message reaches the student", () => {
  it("shows the demo guard instead of 'try again'", () => {
    // The exact case that was found.
    const e = trpc("FORBIDDEN", "זהו חשבון הדגמה — הירשמו כדי לשמור תוכנית משלכם");
    expect(serverSaid(e, FALLBACK)).toBe("זהו חשבון הדגמה — הירשמו כדי לשמור תוכנית משלכם");
  });

  it("shows a quota message, which 'try again' actively contradicts", () => {
    const e = trpc("TOO_MANY_REQUESTS", "הגעתם למגבלת הסריקות לעכשיו — נסו שוב מאוחר יותר.");
    expect(serverSaid(e, FALLBACK)).toMatch(/מגבלת הסריקות/);
  });

  it("shows validation the student can act on", () => {
    const e = trpc("BAD_REQUEST", "הקורס כבר נמצא בסמסטר הזה");
    expect(serverSaid(e, FALLBACK)).toBe("הקורס כבר נמצא בסמסטר הזה");
  });
});

describe("a broken server does NOT get to speak", () => {
  it("keeps the local sentence on an internal error", () => {
    // The local one knows what was attempted and whether data is safe.
    const e = trpc("INTERNAL_SERVER_ERROR", "connect ECONNREFUSED 10.0.0.1:5432");
    expect(serverSaid(e, FALLBACK)).toBe(FALLBACK);
  });

  it("keeps it when a deliberate code carries an unreadable message", () => {
    // A guard that threw a bare identifier is still not a sentence.
    expect(serverSaid(trpc("FORBIDDEN", "FORBIDDEN"), FALLBACK)).toBe(FALLBACK);
    expect(serverSaid(trpc("BAD_REQUEST", "TypeError: x is undefined"), FALLBACK)).toBe(FALLBACK);
    expect(serverSaid(trpc("CONFLICT", "at handler (/var/task/x.js:1:1)"), FALLBACK)).toBe(FALLBACK);
  });

  it("never shows a wall of text", () => {
    expect(serverSaid(trpc("BAD_REQUEST", "כן ".repeat(200)), FALLBACK)).toBe(FALLBACK);
  });

  it("survives anything at all being thrown", () => {
    for (const junk of [null, undefined, "boom", 42, {}, { message: 5 }, new Error("x")]) {
      expect(serverSaid(junk, FALLBACK)).toBe(FALLBACK);
    }
  });

  it("reads the code from either shape tRPC exposes", () => {
    const viaShape = { message: "זהו חשבון הדגמה — הירשמו כדי לשמור", shape: { data: { code: "FORBIDDEN" } } };
    expect(serverSaid(viaShape, FALLBACK)).toMatch(/חשבון הדגמה/);
  });
});
