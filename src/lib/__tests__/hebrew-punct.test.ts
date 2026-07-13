import { describe, it, expect } from "vitest";
import { normalizeHebrewPunct } from "@/lib/hebrew-punct";

// Read-time normalization of ידיעון course names (live-verify 13.7: the record
// table showed straight-quote פכ"מ next to the app's gershayim פכ״מ).
describe("normalizeHebrewPunct", () => {
  it("turns a straight quote inside a Hebrew acronym into gershayim", () => {
    expect(normalizeHebrewPunct('מתמטיקה לפכ"מ')).toBe("מתמטיקה לפכ״מ");
    expect(normalizeHebrewPunct('סטטיסטיקה לפכ"מ + תרגיל')).toBe("סטטיסטיקה לפכ״מ + תרגיל");
    expect(normalizeHebrewPunct('ביה"ס לכלכלה ע"ש ברגלס')).toBe("ביה״ס לכלכלה ע״ש ברגלס");
  });

  it("turns an apostrophe after a Hebrew letter into geresh (ordinals)", () => {
    expect(normalizeHebrewPunct("מיקרו כלכלה ב' + תרגיל")).toBe("מיקרו כלכלה ב׳ + תרגיל");
    expect(normalizeHebrewPunct("קריאה מודרכת א'")).toBe("קריאה מודרכת א׳");
  });

  it("does NOT touch actual quotation marks around words", () => {
    // Opening quote follows a space, closing quote is followed by a space —
    // neither sits BETWEEN two Hebrew letters, so both survive.
    expect(normalizeHebrewPunct('הקורס "מבוא" לכלכלה')).toBe('הקורס "מבוא" לכלכלה');
  });

  it("leaves English and mark-free strings alone (fast path)", () => {
    expect(normalizeHebrewPunct('Econ "101" intro')).toBe('Econ "101" intro');
    expect(normalizeHebrewPunct("מבוא ללוגיקה")).toBe("מבוא ללוגיקה");
    expect(normalizeHebrewPunct("")).toBe("");
  });

  it("is idempotent on already-normalized names", () => {
    expect(normalizeHebrewPunct("מתמטיקה לפכ״מ")).toBe("מתמטיקה לפכ״מ");
    expect(normalizeHebrewPunct("מיקרו כלכלה ב׳")).toBe("מיקרו כלכלה ב׳");
  });
});
