// =========================================================================
// מכסת הסריקות סופרת את מה שהיא באמת שורפת
// =========================================================================
// אריאל אישר, 4.9: *"מכסת הסריקות: לחייב 3 במונה. **לא** להוריד את
// המגבלות."*
//
// `scan-grades` קורא ל-Gemini שלוש פעמים — קריאה, אימות צולב, ומפקד
// שורות — והמונה ספר אחת. 10 למשתמש ו-150 גלובלי הפכו בפועל ל-30
// ול-450, מול מכסה חינמית של ~1,000 שמשותפת גם למלך.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

const opts = { maxRequests: 10, windowSeconds: 86_400, cost: 3 };
let n = 0;
const freshId = () => `test-${Date.now()}-${n++}`;

describe("מכסה עם עלות אמיתית", () => {
  beforeEach(() => { vi.useRealTimers(); });

  it("סריקה אחת שורפת שלוש יחידות, לא אחת", () => {
    const id = freshId();
    const r = checkRateLimit(id, opts);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(7);
  });

  it("שלוש סריקות ממצות מכסה של 10 — ולא עשר", () => {
    const id = freshId();
    expect(checkRateLimit(id, opts).remaining).toBe(7);
    expect(checkRateLimit(id, opts).remaining).toBe(4);
    expect(checkRateLimit(id, opts).remaining).toBe(1);
    // הרביעית תשרוף 3 כשנשארה 1 — נדחית לפני שגוגל נשרפת
    const fourth = checkRateLimit(id, opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(1);
  });

  it("בקשה נדחית **לא** מגדילה את המונה", () => {
    const id = freshId();
    for (let i = 0; i < 3; i++) checkRateLimit(id, opts);
    const a = checkRateLimit(id, opts);
    const b = checkRateLimit(id, opts);
    expect(a.allowed).toBe(false);
    expect(b.remaining).toBe(a.remaining); // לא זז
  });

  it("ברירת המחדל נשארה 1 — שאר הקוראים לא הושפעו", () => {
    const id = freshId();
    const plain = { maxRequests: 5, windowSeconds: 60 };
    expect(checkRateLimit(id, plain).remaining).toBe(4);
    expect(checkRateLimit(id, plain).remaining).toBe(3);
  });

  it("המגבלות עצמן לא ירדו — 10 למשתמש ו-150 גלובלי", async () => {
    // אריאל היה מפורש: להוריד מ-10 ל-4 זה לחסום סטודנט אמיתי ביום ההשקה.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/api/ai/scan-grades/route.ts", "utf-8"));
    expect(src).toMatch(/maxRequests:\s*10\b/);
    expect(src).toMatch(/maxRequests:\s*150\b/);
    expect(src).toMatch(/cost:\s*GEMINI_CALLS_PER_SCAN/);
    expect(src).toMatch(/GEMINI_CALLS_PER_SCAN\s*=\s*3/);
  });
});
