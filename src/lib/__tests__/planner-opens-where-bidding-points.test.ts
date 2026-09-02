import { describe, it, expect } from "vitest";
import { getAcademicNow, getPlanningAnchor, deriveYearOfStudy } from "@/lib/academic-calendar";
import { getBiddingTarget } from "@/lib/bidding-target";

// =========================================
// הלוח נפתח היכן שהבידינג מצביע
// =========================================
// ב-2.9.2026, חמישה ימים לפני מקצה 1, פתחתי את המתכנן כמשתמש והוא נפתח על
// שנה ב׳ — בזמן שהבידינג מוגש על שנה ג׳ סמסטר א׳. שנה שלמה של פער, במסך
// שאליו מגיעים מהכפתור "לבדיקת חפיפות".
//
// הסיבה: `deriveYearOfStudy` עונה "איפה הסטודנט *נמצא*". בחופשת הסמסטר
// התשובה הזאת היא השנה שהרגע נגמרה, וזה נכון — היא מזינה את תגית "בלימוד".
// היא פשוט לא השאלה שהלוח שואל.
//
// הבדיקה מקבעת את השוויון עצמו, לא את המימוש: אם אי־פעם ייפתח פער בין
// ה"עוגן" שלפיו הלוח נפתח לבין היעד שעליו מגישים — היא תיפול.

const STUDENTS = [
  { label: "מתחיל תשפ״ז", startYear: 2026, expectYear: 1 },
  { label: "התחיל תשפ״ו", startYear: 2025, expectYear: 2 },
  { label: "התחיל תשפ״ה", startYear: 2024, expectYear: 3 },
];

function plannerOpensOn(startYear: number, now: Date) {
  const anchor = getPlanningAnchor(now);
  return deriveYearOfStudy(startYear, 1, anchor.startYear, now);
}

describe("בחופשת הסמסטר — הרגע שבו נפתח הבידינג", () => {
  const now = new Date("2026-09-02T12:00:00+03:00");

  it("אנחנו באמת בחופשה, אחרת הבדיקה בודקת משהו אחר", () => {
    const a = getAcademicNow(now);
    expect(a.phase).toBe("break");
    expect(getPlanningAnchor(now)).toEqual({ startYear: 2026, semester: "FALL" });
  });

  for (const s of STUDENTS) {
    it(`${s.label}: הלוח נפתח על שנה ${s.expectYear} — בדיוק היעד של הבידינג`, () => {
      const opensOn = plannerOpensOn(s.startYear, now);
      expect(opensOn).toBe(s.expectYear);

      const target = getBiddingTarget(s.startYear, deriveYearOfStudy(s.startYear, 1, undefined, now));
      expect(target).not.toBeNull();
      expect(opensOn).toBe(target!.yearOfStudy);
      expect(getPlanningAnchor(now).semester).toBe(target!.semester);
    });
  }

  it("הסימפטום המקורי: 'היכן הסטודנט נמצא' אינו 'מה הוא מתכנן' — ולכן ההפרדה", () => {
    const whereTheyAre = deriveYearOfStudy(2024, 1, undefined, now);
    const whatTheyPlan = plannerOpensOn(2024, now);
    expect(whereTheyAre).toBe(2);
    expect(whatTheyPlan).toBe(3);
  });
});

describe("באמצע סמסטר א׳ — השניים חייבים להתלכד", () => {
  const now = new Date("2026-11-15T12:00:00+02:00");

  it("בזמן לימודים אין פער בין 'נמצא' ל'מתכנן'", () => {
    expect(getAcademicNow(now).phase).toBe("teaching");
    for (const s of STUDENTS) {
      expect(plannerOpensOn(s.startYear, now)).toBe(deriveYearOfStudy(s.startYear, 1, undefined, now));
    }
  });
});
