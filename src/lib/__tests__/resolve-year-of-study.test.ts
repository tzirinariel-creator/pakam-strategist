import { describe, it, expect } from "vitest";
import { resolveYearOfStudy, deriveYearOfStudy } from "@/lib/academic-calendar";

// אריאל, 3.9: "והנה עכשיו שחזרתי הוא מתכנן לי את שנה א׳ שכבר סיימתי
// והעליתי סילבוס שלה!" — נבדק במסד: startYear=null, currentYear=1.
// deriveYearOfStudy החזירה 1 בשקט, וכל מסך הכריז "שנה א׳".

const NOW = new Date("2026-09-03T12:00:00+03:00");

describe("עוגן חסר אינו 'שנה א׳'", () => {
  it("בלי עוגן ובלי קורסים — זה ניחוש, ואומרים את זה", () => {
    const r = resolveYearOfStudy(null, 1, null, NOW);
    expect(r.year).toBe(1);
    expect(r.isGuess).toBe(true);
    expect(r.source).toBe("stored-default");
  });

  it("בלי עוגן אבל עם גיליון — הגיליון עונה, וזה לא ניחוש", () => {
    const r = resolveYearOfStudy(null, 1, 2, NOW);
    expect(r.year).toBe(2);
    expect(r.isGuess).toBe(false);
    expect(r.source).toBe("completed-courses");
    // זה בדיוק המקרה של אריאל, ובלי הרצפה הוא היה מקבל 1:
    expect(deriveYearOfStudy(null, 1, undefined, NOW)).toBe(1);
  });

  it("עוגן קיים — הוא הקובע", () => {
    const r = resolveYearOfStudy(2025, 1, null, NOW);
    expect(r.source).toBe("anchor");
    expect(r.isGuess).toBe(false);
  });

  it("גיליון גבוה מהעוגן — הציונים גוברים על טעות הקלדה בהרשמה", () => {
    // מי שהצהיר שהוא מתחיל עכשיו אבל העלה גיליון עם שנה ב׳ שהושלמה.
    const r = resolveYearOfStudy(2026, 1, 2, NOW);
    expect(r.year).toBe(2);
    expect(r.source).toBe("completed-courses");
  });

  it("גיליון נמוך מהעוגן לא מחזיר אחורה", () => {
    // 3.9.2026 היא חופשת הסמסטר של תשפ״ו, אז השנה האקדמית **הנוכחית** היא
    // 2025 ו-startYear=2024 נותן שנה ב׳. הרצפה (1) לא מחזירה אחורה.
    // ההבחנה בין "השנה שאני בה" ל"השנה שאני מתכנן" נשמרת אצל הקורא —
    // ראה planner-opens-where-bidding-points.test.ts.
    const r = resolveYearOfStudy(2024, 1, 1, NOW);
    expect(r.year).toBe(2);
    expect(r.source).toBe("anchor");
  });

  it("לעולם לא מעל 3 ולא מתחת ל-1", () => {
    expect(resolveYearOfStudy(null, 1, 9, NOW).year).toBe(3);
    expect(resolveYearOfStudy(null, 0, null, NOW).year).toBe(1);
    expect(resolveYearOfStudy(null, 99, null, NOW).year).toBe(3);
  });
});
