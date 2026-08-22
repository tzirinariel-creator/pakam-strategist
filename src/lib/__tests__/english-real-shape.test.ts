// =========================================================================
// English, in the shape a real student's row actually has
// =========================================================================
// The team review found the English exclusion missing from two more engines,
// and both survived for the same reason: every existing test builds its
// English row as `courseType: "ENGLISH"`, and NO row a real student owns
// carries that flag.
//
//   · the scanner writes ELECTIVE           (plan.ts:443, 559, 665)
//   · manual entry writes ELECTIVE
//   · מתקדמים ב׳ — 2171-9201, the row Ariel reported four times — is
//     ELECTIVE in the catalog itself (verified against the production DB)
//
// So `rule-engine.test.ts:390` was green, `year-transition.ts:34` was wrong,
// and the two agreed only about a row that does not exist in production. That
// is the fourth time in this project a passing test has held a bug in place.
//
// These fixtures carry no courseType at all — just the name and code TAU
// actually prints — which is the only shape in which either bug is visible.

import { describe, it, expect } from "vitest";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import { calculateCredits } from "@/lib/credit-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

let seq = 0;
/** A row the way the scanner writes it: ELECTIVE, real name, real code. */
function realRow(over: {
  code: string;
  nameHe: string;
  credits?: number;
  grade?: number | null;
  courseType?: string;
  discipline?: string;
  status?: string;
}): UserCourseWithCourse {
  seq += 1;
  const courseId = `c-${over.code}-${seq}`;
  return {
    id: `uc-${seq}`,
    courseId,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? 85,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: 1,
    plannedYear: 1,
    disciplineOverride: null,
    course: {
      id: courseId,
      code: over.code,
      nameHe: over.nameHe,
      nameEn: null,
      discipline: over.discipline ?? "ECONOMICS",
      courseType: over.courseType ?? "ELECTIVE",
      isMandatory: false,
      credits: over.credits ?? 4,
    },
  } as unknown as UserCourseWithCourse;
}

/** מתקדמים ב׳ exactly as production stores it. Note: no "אנגלית" in the name. */
const english = (grade: number) =>
  realRow({
    code: "2171-9201",
    nameHe: "מתקדמים ב' חוצה דיצפלינות בין תחומי",
    credits: 4,
    grade,
  });

const ordinary = (grade: number, credits = 4) =>
  realRow({ code: "1011-2103", nameHe: "מיקרו כלכלה א'", credits, grade, courseType: "MANDATORY" });

const gate = (courses: UserCourseWithCourse[]) =>
  runRegulationEngine(courses, "ECONOMICS" as never).results.find((r) => r.ruleId === "PKM-016");

describe("PKM-016 — the BLOCKING year-1→2 gate, with the row students really have", () => {
  it("does not let a low English grade drag the gate down", () => {
    // 80 alone passes the 75 bar. Averaged with a 65 in English it reads 72.5
    // and BLOCKS continuation — while the student's own grades screen shows 80.
    const r = gate([ordinary(80), english(65)]);
    expect((r?.details as { courseAverage: number }).courseAverage).toBe(80);
  });

  it("does not let a high English grade mask a real block", () => {
    // The dangerous direction: 70 and a 95 in English average to 82.5 and read
    // as "you may continue" when the student may not.
    const r = gate([ordinary(70), english(95)]);
    expect((r?.details as { courseAverage: number }).courseAverage).toBe(70);
  });
});

describe("the 150 ש״ס — English LEVEL courses stay out of it", () => {
  // The app already says this to the student in its own words, at
  // src/lib/regulations/rules/english.ts:140 — "(לא נספרים ב-150 ש״ס)".
  // This engine prints the number that sentence sits beside.
  it("does not add a level course's credits to the total", () => {
    const withLevel = calculateCredits([ordinary(80), english(90)], null);
    const withoutLevel = calculateCredits([ordinary(80)], null);
    expect(withLevel.totalCredits).toBe(withoutLevel.totalCredits);
  });

  it("still counts an ordinary course — the check is not zeroing everything", () => {
    expect(calculateCredits([ordinary(80)], null).totalCredits).toBe(4);
  });

  it("keeps a CONTENT course taught in English inside the 150", () => {
    // Only LEVEL courses are excluded. A content course that happens to be
    // taught in English is an ordinary course: out of the average, inside the
    // credit count. Zeroing it too would under-count the degree.
    const content = realRow({
      code: "1031-3456",
      nameHe: "Global Political Economy",
      credits: 4,
      grade: 88,
    });
    expect(calculateCredits([content], null).totalCredits).toBe(4);
  });
});
