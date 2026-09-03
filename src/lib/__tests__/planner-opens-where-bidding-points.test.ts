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

  // 4.9 — הבדיקה הזאת קיבעה קודם את ה**פער**: deriveYearOfStudy החזירה 2
  // ("היכן הסטודנט נמצא") בזמן שהלוח נפתח על 3. ההפרדה הזאת נבנתה כתיקון
  // נקודתי בלוח.
  //
  // ואז מצאתי במעבר כמשתמש שהפער הזה אינו מקומי ללוח: הוא נזל לשורת הזהות
  // בדף הבית והציג "שנה א׳" לסטודנט שנה ב׳ — כלומר לכל מי שנרשם בשבוע
  // ההשקה. התיקון עבר לשורש, ל-deriveYearOfStudy עצמה.
  //
  // אז מה קרה להבחנה? בחופשה **אין לה צרכן**: isCurrentlyStudying
  // (semester-clock.ts:56) יוצאת מוקדם כשלא מלמדים, אז שום דבר לא נשען
  // על "השנה שנגמרה", וכל הצהרה גלויה — הלוח, הבידינג, ההגדרות, שורת
  // הזהות — מתכוונת לשנה שמתחילה. הבדיקה מקבעת עכשיו את התכונה החזקה
  // יותר: בחופשה השתיים **מסכימות**, ושתיהן שוות ליעד הבידינג.
  it("בחופשה — 'היכן אני' ו'מה אני מתכנן' מסכימים, ושניהם יעד הבידינג", () => {
    for (const startYear of [2026, 2025, 2024]) {
      const whereTheyAre = deriveYearOfStudy(startYear, 1, undefined, now);
      const whatTheyPlan = plannerOpensOn(startYear, now);
      expect(whereTheyAre).toBe(whatTheyPlan);
      const target = getBiddingTarget(startYear, whereTheyAre);
      expect(target).not.toBeNull();
      expect(whereTheyAre).toBe(target!.yearOfStudy);
    }
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
