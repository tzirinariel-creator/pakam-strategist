// =========================================================================
// טופס 3010 של מילואימניק שנה ג׳ — שירות בשנה א׳ וגם בשנה ב׳
// =========================================================================
// אריאל, 5.9: *"אני מקווה שזה היה תופס אם הוא היה מעלה טופס 3010 של כל
// התקופות האלו — תוודא את זה בבקשה."*
//
// זו הבדיקה שעונה על זה. סטודנט שהתחיל בתשפ״ה (2024) ונמצא עכשיו בשנה ג׳
// (תשפ״ז) מעלה טופס אחד שמכיל את כל הקריירה שלו: שירות לפני התואר, שירות
// בשנה א׳ ובשנה ב׳, ושירות בקיץ שבין השנים.
//
// שלוש התכונות שנבדקות כאן הן בדיוק שלוש הדרכים שבהן זה יכול להיכשל בשקט:
//   1. תקופה מלפני שנתיים תיפול מחוץ ללוחות שאנחנו מכירים ותיעלם ל-unmapped
//   2. שירות קיץ ייפול בין הסמסטרים ולא ישויך לאף אחד
//   3. שירות שקדם לתואר ייספר ויזכה בהטבות שלא מגיעות

import { describe, it, expect } from "vitest";
import { parseForm3010, summarizeForm3010 } from "@/lib/form-3010";

/** טופס אמיתי בצורתו: תקופות DD/MM/YYYY עם ימים עשרוניים. */
const FORM = JSON.stringify({
  periods: [
    // לפני התואר — אוקטובר 2023, מלחמה. תשפ״ד.
    { startDate: "08/10/2023", endDate: "20/12/2023", days: 74 },
    // שנה א׳ (תשפ״ה) סמסטר א׳ — הלימודים החלו 3.11.2024.
    { startDate: "10/11/2024", endDate: "25/12/2024", days: 46 },
    // שנה א׳ (תשפ״ה) סמסטר ב׳ — מ-17.3.2025.
    { startDate: "01/04/2025", endDate: "12/05/2025", days: 42 },
    // הקיץ שבין שנה א׳ לשנה ב׳ — אחרי מבחני תשפ״ה, לפני 26.10.2025.
    { startDate: "20/08/2025", endDate: "10/09/2025", days: 22 },
    // שנה ב׳ (תשפ״ו) סמסטר א׳ — מ-26.10.2025.
    { startDate: "05/12/2025", endDate: "15/01/2026", days: 42 },
    // שנה ב׳ (תשפ״ו) סמסטר ב׳ — מ-12.4.2026.
    { startDate: "01/05/2026", endDate: "10/06/2026", days: 41 },
  ],
  totalDays: null,
});

describe("3010 של מילואימניק שנה ג׳", () => {
  const form = parseForm3010(FORM)!;

  it("כל שש התקופות נקראות", () => {
    expect(form.periods).toHaveLength(6);
  });

  it("שום תקופה לא נופלת בין הכיסאות — unmapped ריק", () => {
    // startYear=2024 → התואר החל בתשפ״ה.
    const s = summarizeForm3010(form, { startYear: 2024 });
    expect(s.unmapped).toEqual([]);
  });

  it("ארבעת סמסטרי התואר מזוהים בנפרד, כל אחד עם הימים שלו", () => {
    const s = summarizeForm3010(form, { startYear: 2024 });
    const key = (y: number, sem: string) =>
      s.suggestions.find((x) => x.academicYear === y && x.semester === sem);

    // שנה א׳ — תשפ״ה
    expect(key(2024, "FALL")?.days).toBe(46);
    // סמסטר ב׳ של תשפ״ה בולע גם את שירות הקיץ שאחריו: חלון ה-SPRING
    // נמשך עד תחילת ההוראה של תשפ״ו, וזה הדבר הנכון — אין סמסטר אחר
    // שהוא שייך אליו, ולזרוק אותו ל-unmapped היה מוחק 22 ימי שירות.
    expect(key(2024, "SPRING")?.days).toBe(42 + 22);
    // שנה ב׳ — תשפ״ו
    expect(key(2025, "FALL")?.days).toBe(42);
    expect(key(2025, "SPRING")?.days).toBe(41);
    expect(s.suggestions).toHaveLength(4);
  });

  it("השירות שקדם לתואר מזוהה ומופרד — לא נספר, ולא נעלם", () => {
    const s = summarizeForm3010(form, { startYear: 2024 });
    expect(s.preDegree).toHaveLength(1);
    expect(s.preDegree[0]!.academicYear).toBe(2023);
    expect(s.preDegree[0]!.days).toBe(74);
    // הוא לא נכנס להצעות שמייבאים
    expect(s.suggestions.some((x) => x.academicYear === 2023)).toBe(false);
  });

  it("סה״כ הימים הוא סכום כל השורות המודפסות, בלי לחשב מחדש", () => {
    const s = summarizeForm3010(form, { startYear: 2024 });
    expect(s.totalDays).toBe(74 + 46 + 42 + 22 + 42 + 41);
  });

  it("בלי שנת פתיחה ידועה — כלום לא מסונן, וזה נאמר במפורש", () => {
    const s = summarizeForm3010(form, {});
    expect(s.startYear).toBeNull();
    expect(s.preDegree).toEqual([]);
    expect(s.suggestions).toHaveLength(5); // כולל תשפ״ד
  });

  it("כל סמסטר נושא תווית עברית אמיתית להצגה", () => {
    const s = summarizeForm3010(form, { startYear: 2024 });
    expect(s.suggestions.map((x) => x.labelHe)).toEqual([
      "תשפ״ה",
      "תשפ״ה",
      "תשפ״ו",
      "תשפ״ו",
    ]);
  });
});
