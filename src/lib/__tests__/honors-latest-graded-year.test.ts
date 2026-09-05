// =========================================================================
// הצטיינות נמדדת על שנה שהסתיימה — לא על השנה שרק מתחילה
// =========================================================================
// אריאל, 5.9: *"נדפק שם משהו עם ההצטיינות, זה לא מראה על זה שום דבר וחבל."*
// הכרטיס מדד תמיד את שנת הלימודים הנוכחית. בספטמבר — ובכל רגע לפני שנכנס
// הציון הראשון של השנה — היא ריקה בהגדרה, ולכן סטודנט עם שנתיים של ציונים
// בתיק ראה "עדיין אין מספיק ציונים".

import { describe, it, expect } from "vitest";
import { latestGradedStudyYear, computeHonorsDistance } from "@/lib/honors";
import type { UserCourseWithCourse } from "@/types/degree";

const course = (
  id: string,
  plannedYear: number,
  grade: number | null,
  status: string,
  credits = 4,
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    courseId: `c-${id}`,
    plannedYear,
    plannedSemester: "FALL",
    status,
    grade,
    isBinary: false,
    attemptNumber: 1,
    course: { id: `c-${id}`, code: `0000-${id}`, nameHe: id, credits, courseType: "ELECTIVE", ...extra },
  }) as unknown as UserCourseWithCourse;

describe("latestGradedStudyYear", () => {
  it("מחזיר את השנה האחרונה שיש בה ציונים, גם כשהשנה הנוכחית ריקה", () => {
    const rows = [
      course("a", 1, 90, "COMPLETED"),
      course("b", 2, 95, "COMPLETED"),
      course("c", 3, null, "PLANNED"),
    ];
    expect(latestGradedStudyYear(rows, 3)).toBe(2);
  });

  it("מעדיף את השנה הנוכחית כשיש בה ציון", () => {
    const rows = [course("a", 1, 90, "COMPLETED"), course("b", 3, 88, "COMPLETED")];
    expect(latestGradedStudyYear(rows, 3)).toBe(3);
  });

  it("לעולם לא מחזיר שנה גבוהה מהשנה הנוכחית", () => {
    // שורה מתוכננת לשנה ד׳ עם ציון שהוזן בטעות לא תזיז את המדידה קדימה.
    const rows = [course("a", 2, 90, "COMPLETED"), course("d", 4, 100, "COMPLETED")];
    expect(latestGradedStudyYear(rows, 3)).toBe(2);
  });

  it("null כשאין ולו ציון אחד שנספר", () => {
    expect(latestGradedStudyYear([course("a", 1, null, "PLANNED")], 3)).toBeNull();
  });

  it("מתעלם מקורס בינארי ומסמינר — בדיוק כמו הממוצע", () => {
    const rows = [
      course("a", 1, 90, "COMPLETED"),
      course("bin", 2, 88, "COMPLETED", 4, {}),
      course("sem", 2, 99, "COMPLETED", 4, { courseType: "SEMINAR" }),
    ];
    (rows[1] as unknown as { isBinary: boolean }).isBinary = true;
    expect(latestGradedStudyYear(rows, 3)).toBe(1);
  });

  it("הכרטיס אכן מקבל ממוצע במקום ריק — התרחיש של אריאל", () => {
    const rows = [
      course("a", 1, 90, "COMPLETED", 5),
      course("b", 2, 100, "COMPLETED", 5),
      course("c", 3, null, "PLANNED", 5),
    ];
    // הדרך הישנה: מדידה של שנה 3 → אין נתון.
    expect(computeHonorsDistance(rows, 3).yearlyAverage).toBeNull();
    // הדרך החדשה: השנה האחרונה שיש בה ציונים.
    const year = latestGradedStudyYear(rows, 3)!;
    expect(computeHonorsDistance(rows, year).yearlyAverage).toBe(100);
  });
});
