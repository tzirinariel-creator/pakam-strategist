// =========================================================================
// The combined figure has to be a number that can exist
// =========================================================================
// From the deep research pass Ariel asked for. "מה באמת יזיז לכם את הממוצע"
// closes with the most honest sentence on the screen — the one telling a
// student that a single course moves less than it feels like, so they should
// not give up their summer over it. It was printing a figure that could not
// happen: a real second-year on 83.6 was told the average would rise by
// 25.12 points, which puts it at 108.7. A first-year with five grades was
// shown 102.5.
//
// The cause is that `leverSummary.totalUpside` ADDS deltas that were each
// computed separately. Every lever's delta is measured against a denominator
// that a planned course also enlarges once it gains a grade, so the sum
// over-counts — badly, and worse the more levers are listed.
//
// The screen now simulates the listed courses together, in one pass, through
// the same engine as everything else. This pins the property that matters:
// whatever the combined figure says, current + combined must land somewhere a
// grade can actually be.

import { describe, it, expect } from "vitest";
import { simulate } from "@/lib/grade-simulator";
import { gradeLevers, leverSummary } from "@/lib/grade-levers";
import type { UserCourseWithCourse } from "@/types/degree";

let seq = 0;
const course = (grade: number | null, credits = 4): UserCourseWithCourse => {
  seq += 1;
  return {
    id: `uc-${seq}`,
    courseId: `c-${seq}`,
    status: grade == null ? "PLANNED" : "COMPLETED",
    grade,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: 1,
    plannedYear: 1,
    plannedSemester: "FALL",
    isBinary: false,
    disciplineOverride: null,
    course: {
      id: `c-${seq}`,
      code: `1011-${1000 + seq}`,
      nameHe: `קורס ${seq}`,
      nameEn: null,
      discipline: "ECONOMICS",
      courseType: "ELECTIVE",
      isMandatory: false,
      credits,
    },
  } as unknown as UserCourseWithCourse;
};

/** What the screen now computes: one simulation over the listed courses. */
const combined = (courses: UserCourseWithCourse[], limit = 4) => {
  const levers = gradeLevers(courses, { keepsHigherGrade: false });
  const shown = levers.slice(0, limit);
  if (shown.length === 0) return null;
  const overrides = Object.fromEntries(shown.map((l) => [l.userCourseId, { grade: l.assumedGrade }]));
  return simulate(courses, overrides, { preferHigherGrade: false }).averageDelta;
};

describe("the combined upside lands somewhere a grade can be", () => {
  it("never pushes the average past 100", () => {
    // Graded courses plus planned ones — the mix every real student has, and
    // the one the old sum turned into 110.8.
    const courses = [course(72), course(74), course(76), course(null), course(null), course(null)];
    const before = simulate(courses, {}, {}).current.courseAverage!;
    const delta = combined(courses)!;
    expect(before + delta).toBeLessThanOrEqual(100);
  });

  it("does not exceed the assumed grade itself", () => {
    // If every listed course ended at 95, the average cannot beat 95.
    const courses = [course(60), course(65), course(null), course(null), course(null)];
    const before = simulate(courses, {}, {}).current.courseAverage!;
    expect(before + combined(courses)!).toBeLessThanOrEqual(95.0001);
  });

  it("is smaller than the old sum once a planned course is in the mix", () => {
    // The regression witness. The error is always in the OPTIMISTIC direction,
    // which is the dangerous one for a sentence urging someone not to give up
    // their summer.
    const courses = [course(80), course(78), course(null), course(null), course(null), course(null), course(null)];
    const levers = gradeLevers(courses, { keepsHigherGrade: false });
    const oldSum = leverSummary(levers)!.totalUpside;
    const now = combined(courses)!;
    expect(now).toBeLessThan(oldSum);
    const before = simulate(courses, {}, {}).current.courseAverage!;
    expect(before + oldSum).toBeGreaterThan(100); // what shipped
    expect(before + now).toBeLessThanOrEqual(100); // what ships now
  });

  it("leaves the sum alone when every course is already graded", () => {
    // Nothing to over-count there: the denominator does not move, so the two
    // agree. Worth pinning so the fix is not mistaken for "always smaller".
    const courses = [course(72), course(74), course(76), course(78)];
    const levers = gradeLevers(courses, { keepsHigherGrade: false });
    expect(combined(courses)).toBeCloseTo(leverSummary(levers)!.totalUpside, 2);
  });

  it("agrees with the single-course delta when only one course is listed", () => {
    // With one lever there is nothing to over-count, so the two must match.
    const courses = [course(70), course(90), course(92)];
    const levers = gradeLevers(courses, { keepsHigherGrade: false });
    expect(combined(courses, 1)).toBeCloseTo(levers[0]!.upside, 2);
  });
});
