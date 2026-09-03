import { describe, it, expect } from "vitest";
import { getAcademicNow, getPlanningAnchor } from "@/lib/academic-calendar";

// =========================================
// "פכ״מ · שנה א׳ · סמסטר ב׳" למי שתכנן סמסטר א׳
// =========================================
// שלב ג׳, 4.9: נרשמתי כסטודנט שנה א׳ שמתחיל סמסטר א׳, בניתי מערכת של
// סמסטר א׳ ושמרתי — ודף הבית קידם אותי ב"סמסטר ב׳".
//
// שורת הזהות קראה את הסמסטר של הלוח האקדמי. בחופשה שאחרי אביב הוא
// SPRING, כלומר הסמסטר שהסתיים — בזמן שהמערכת, המקצה וה-CTA כולם על
// סמסטר א׳. הבדיקה מקבעת את הכלל: בזמן לימודים — הסמסטר הרץ; בחופשה —
// הסמסטר שמתחיל.

function shownSemester(now: Date) {
  const a = getAcademicNow(now);
  return a.phase === "teaching" ? a.semester : getPlanningAnchor(now).semester;
}

describe("הסמסטר שמוצג בשורת הזהות", () => {
  it("בחופשה שאחרי אביב — הסמסטר שמתחיל, לא זה שנגמר", () => {
    const now = new Date("2026-09-04T10:00:00+03:00");
    expect(getAcademicNow(now).phase).toBe("break");
    expect(getAcademicNow(now).semester).toBe("SPRING"); // מה שהיה מוצג
    expect(shownSemester(now)).toBe("FALL"); // מה שמוצג עכשיו
  });

  it("באמצע סמסטר א׳ — הסמסטר הרץ, בלי שינוי", () => {
    const now = new Date("2026-11-15T10:00:00+02:00");
    expect(getAcademicNow(now).phase).toBe("teaching");
    expect(shownSemester(now)).toBe(getAcademicNow(now).semester);
  });

  it("מה שמוצג תמיד מסכים עם מה שהלוח נפתח עליו", () => {
    for (const iso of ["2026-09-04", "2026-11-15", "2027-01-20", "2027-04-10"]) {
      const now = new Date(`${iso}T10:00:00Z`);
      const a = getAcademicNow(now);
      if (a.phase !== "teaching") {
        expect(shownSemester(now)).toBe(getPlanningAnchor(now).semester);
      }
    }
  });
});
