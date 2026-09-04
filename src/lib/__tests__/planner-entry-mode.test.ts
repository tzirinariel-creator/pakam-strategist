import { describe, it, expect } from "vitest";

// 4.9 — אריאל, תוך כדי שימוש: *"כשבאתי לתכנן את הסמסטרים זה לא קפץ מיידית
// לתכנון שנתי אלא העביר אותי דרך עוד מסך ביניים."* וזו גם ההערה שחזרה
// כמה פעמים כ"למה יש שני מסכים".
//
// הכלל שהיה: showSummary = summaryPref ?? (!isLoadingCourses && mandatoryHeavy)
// הכלל עכשיו: showSummary = summaryPref ?? (!startInEditor && !isLoading && heavy)
//
// הבדיקה מקבעת את ההבחנה עצמה — לא את הביטוי.
function showSummary(o: {
  summaryPref: boolean | null;
  startInEditor: boolean;
  isLoadingCourses: boolean;
  mandatoryHeavy: boolean;
}) {
  return o.summaryPref ?? (!o.startInEditor && !o.isLoadingCourses && o.mandatoryHeavy);
}

describe("על מה נפתח מתכנן הסמסטר", () => {
  const heavy = { isLoadingCourses: false, mandatoryHeavy: true };

  it("מהלוח — נפתח על העורך, גם בסמסטר חובה־כבד", () => {
    expect(showSummary({ ...heavy, summaryPref: null, startInEditor: true })).toBe(false);
  });

  it("באשף — נפתח על הסיכום, כי שם רק מאשרים מה שהרכבנו", () => {
    expect(showSummary({ ...heavy, summaryPref: null, startInEditor: false })).toBe(true);
  });

  it("סמסטר עם בחירה אמיתית — תמיד עורך, בשני המסלולים", () => {
    for (const startInEditor of [true, false])
      expect(showSummary({ isLoadingCourses: false, mandatoryHeavy: false, summaryPref: null, startInEditor })).toBe(false);
  });

  it("הבחירה של הסטודנט גוברת על שניהם", () => {
    expect(showSummary({ ...heavy, summaryPref: true, startInEditor: true })).toBe(true);
    expect(showSummary({ ...heavy, summaryPref: false, startInEditor: false })).toBe(false);
  });

  it("בזמן טעינה מראים עורך ולא סיכום ריק", () => {
    expect(showSummary({ isLoadingCourses: true, mandatoryHeavy: true, summaryPref: null, startInEditor: false })).toBe(false);
  });
});
