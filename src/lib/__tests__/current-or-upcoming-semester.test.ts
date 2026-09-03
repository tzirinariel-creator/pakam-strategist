import { describe, it, expect } from "vitest";
import { getCurrentOrUpcomingSemester, getAcademicNow, getPlanningAnchor } from "@/lib/academic-calendar";

// 4.9 — שלושה מסכים נתקלו באותו קיר בשבוע אחד, כל אחד עם עקיפה משלו.
// הכלל עבר למקום אחד עם שם, והבדיקה מקבעת את ההבדל בין שתי השאלות.
describe("איזה סמסטר — זה שקורה עכשיו, או זה שאני נכנס אליו", () => {
  const summerBreak = new Date("2026-09-04T09:00:00+03:00");
  const midFall = new Date("2026-11-20T09:00:00+02:00");

  it("בחופשה — מחזיר את הסמסטר שמתחיל, לא את זה שנגמר", () => {
    const got = getCurrentOrUpcomingSemester(summerBreak);
    const anchor = getPlanningAnchor(summerBreak);
    expect(got.startYear).toBe(anchor.startYear);
    expect(got.semester).toBe(anchor.semester);
    // וזה באמת שונה ממה ש-getAcademicNow אומר — אחרת אין לתיקון משמעות
    const now = getAcademicNow(summerBreak);
    expect(`${got.startYear}/${got.semester}`).not.toBe(`${now.startYear}/${now.semester}`);
  });

  it("באמצע הסמסטר — זהה ל-getAcademicNow, בלי לקפוץ קדימה", () => {
    const got = getCurrentOrUpcomingSemester(midFall);
    const now = getAcademicNow(midFall);
    expect(got.startYear).toBe(now.startYear);
    expect(got.semester).toBe(now.semester);
  });
});
