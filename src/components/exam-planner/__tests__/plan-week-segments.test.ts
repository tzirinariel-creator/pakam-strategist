// =========================================================================
// M44 — רצף שבועות ריקים מתקפל לשורה אחת
// =========================================================================
// אריאל, שלוש פעמים: *"ושוב לוח מבחנים בלתי נגמר שאי אפשר להבין ממנו כלום"*.
// הצילום שלו (עמ׳ 21) מראה שבועות מ-30.8 ועד 24.10 שכל תא בהם הוא
// "+ לימוד" ותו לא. הלוח לא ארוך — הוא ריק.
//
// הצמדת ההתחלה לתוכנית טיפלה בקצה. זה מטפל באמצע.
//
// למה יש כאן בדיקה ולא רק אימות חי: התוכנית שבניתי בפרודקשן ב-4.9 מכילה
// **שבוע ריק אחד בלבד**, כלומר היא לא מפעילה את הקיפול בכלל. אימות חי על
// נתונים שלא מגיעים לענף הוא לא אימות — זו בדיוק הטעות שמתועדת בתוכנית
// ("לבדוק איזה ענף באמת מרונדר").
import { describe, it, expect } from "vitest";
import { planWeekSegments } from "@/components/exam-planner/exam-planner-utils";

/** "..##..." → שבוע עם תוכן = '#' */
const seg = (pattern: string, minRun = 2) =>
  planWeekSegments(pattern.length, (w) => pattern[w] === "#", minRun);

describe("קיפול שבועות ריקים בלוח השבועי", () => {
  it("לוח שכולו מלא — שום דבר לא מתקפל", () => {
    expect(seg("###")).toEqual([
      { kind: "week", w: 0 }, { kind: "week", w: 1 }, { kind: "week", w: 2 },
    ]);
  });

  it("רצף ריק באמצע מתקפל לשורה אחת", () => {
    // בדיוק הצורה שראיתי בפרודקשן, רק ארוכה יותר: אשכול, פער, אשכול.
    expect(seg("##..##")).toEqual([
      { kind: "week", w: 0 }, { kind: "week", w: 1 },
      { kind: "gap", from: 2, to: 3 },
      { kind: "week", w: 4 }, { kind: "week", w: 5 },
    ]);
  });

  it("שבוע ריק בודד לא מתקפל — שורת הקיפול אינה קצרה מהשורה שהיא מחליפה", () => {
    expect(seg("#.#")).toEqual([
      { kind: "week", w: 0 }, { kind: "week", w: 1 }, { kind: "week", w: 2 },
    ]);
  });

  it("הפער של אריאל — שמונה שבועות ריקים לפני שיש מה ללמוד", () => {
    // 30.8 עד 24.10 בצילום שלו: שמונה שורות של שבעה תאים ריקים.
    expect(seg("........#")).toEqual([
      { kind: "gap", from: 0, to: 7 },
      { kind: "week", w: 8 },
    ]);
  });

  it("שני פערים נפרדים מתקפלים בנפרד", () => {
    expect(seg("#..#..#")).toEqual([
      { kind: "week", w: 0 },
      { kind: "gap", from: 1, to: 2 },
      { kind: "week", w: 3 },
      { kind: "gap", from: 4, to: 5 },
      { kind: "week", w: 6 },
    ]);
  });

  it("רצף ריק בסוף מתקפל גם הוא", () => {
    expect(seg("#...")).toEqual([
      { kind: "week", w: 0 },
      { kind: "gap", from: 1, to: 3 },
    ]);
  });

  it("כל שבוע מופיע בדיוק פעם אחת, בסדר, בלי חורים ובלי כפילויות", () => {
    for (const pattern of ["#", "..", ".#.", "##..##.#", "........", "#.#.#.#"]) {
      const covered: number[] = [];
      for (const s of planWeekSegments(pattern.length, (w) => pattern[w] === "#")) {
        if (s.kind === "week") covered.push(s.w);
        else for (let w = s.from; w <= s.to; w++) covered.push(w);
      }
      expect(covered, `דפוס ${pattern}`).toEqual([...Array(pattern.length).keys()]);
    }
  });
});
