import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * צ'אט המלך היה המשטח היחיד באפליקציה שבו תוכן נכתב מעצמו בלי ששום דבר
 * מכריז עליו. סטודנט שמשתמש בקורא־מסך שאל שאלה, התשובה זרמה לתוך העמוד,
 * והוא לא ידע שהיא שם. הסורקים והטפסים כבר היו מכוסים; דווקא ה-AI, שהוא
 * הבידול של המוצר, לא.
 *
 * זהו שומר ברמת המקור ולא בדיקת רינדור, ובכוונה: `FloatingAssistant` הוא
 * 1,300 שורות שתלויות בכל עץ ה-tRPC, ב-persona ובמכסות. בדיקה שתעמיד את
 * כל זה תיבדק בעיקר על עצמה. מה שצריך להישמר כאן הוא ארבע התכונות על
 * מיכל הגלילה — והן בדיוק מה שנמחק בשקט ברפקטור הבא.
 *
 * אותו דפוס כמו `lib/__tests__/catalog-count.test.ts`, שקורא קובץ במקום
 * להריץ שאילתה, ומאותה סיבה.
 */

const SRC = readFileSync(
  join(process.cwd(), "src/components/layout/floating-assistant.tsx"),
  "utf8",
);

/** הבלוק שמתחיל ב-ref={scrollRef} ועד סוף תגית הפתיחה. */
const logTag = (() => {
  const i = SRC.indexOf("ref={scrollRef}");
  if (i === -1) return null;
  const end = SRC.indexOf(">", i);
  // אחורה עד תחילת התגית
  const start = SRC.lastIndexOf("<div", i);
  return SRC.slice(start, end + 1);
})();

describe("צ'אט היועץ מכריז על תשובות לקורא־מסך", () => {
  it("מיכל השיחה עדיין קיים", () => {
    expect(logTag).not.toBeNull();
  });

  it('הוא role="log" — תעתיק שנצבר, לא הודעה מתחלפת', () => {
    expect(logTag).toContain('role="log"');
  });

  it('הוא aria-live="polite" ולא assertive', () => {
    expect(logTag).toContain('aria-live="polite"');
    // assertive היה קוטע למשתמש את מה שהוא קורא באמצע. תשובת יועץ
    // אינה חירום.
    expect(logTag).not.toContain('aria-live="assertive"');
  });

  it('הוא aria-relevant="additions" — אחרת כל טוקן בזרם מקריא את כל השיחה', () => {
    expect(logTag).toContain('aria-relevant="additions"');
  });

  it("יש לו שם נגיש בשתי השפות", () => {
    expect(logTag).toContain("aria-label");
    expect(SRC).toContain('"שיחה עם היועץ"');
    expect(SRC).toContain('"Advisor conversation"');
  });
});
