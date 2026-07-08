import { describe, it, expect } from "vitest";
import { calculateCredits } from "@/lib/credit-calculator";
import { calculateGraduationScore } from "@/lib/grade-calculator";
import type { UserCourseWithCourse } from "@/types/degree";

// Regression for #31: IN_PROGRESS and EXEMPT courses used to contribute ZERO
// credits — under-counting the "My status" hero and producing false "still
// missing" regulation results. They must now count (EXEMPT as earned,
// IN_PROGRESS as planned), while EXEMPT stays OUT of the GPA.

let seq = 0;
function uc(
  status: string,
  opts: { credits?: number; courseType?: string; discipline?: string; grade?: number | null } = {}
): UserCourseWithCourse {
  seq += 1;
  const courseType = opts.courseType ?? "ELECTIVE";
  return {
    id: `uc-${seq}`,
    userId: "u",
    courseId: `c-${seq}`,
    status,
    grade: opts.grade ?? null,
    plannedYear: 2,
    plannedSemester: "FALL",
    attemptNumber: 1,
    isGradeImproved: false,
    isBinary: false,
    disciplineOverride: null,
    submissionType: null,
    submissionGrade: null,
    notes: null,
    selectedGroups: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    course: {
      id: `c-${seq}`,
      code: `C-${seq}`,
      nameHe: "קורס",
      nameEn: "Course",
      discipline: opts.discipline ?? "ECONOMICS",
      courseType,
      credits: opts.credits ?? 4,
      isMandatory: courseType === "MANDATORY",
      canCountAs: [],
      yearOffered: [2],
      semesterOffered: ["FALL"],
      prerequisites: [],
    },
  } as unknown as UserCourseWithCourse;
}

describe("credit-calculator status semantics (#31)", () => {
  it("counts EXEMPT credits as EARNED", () => {
    const r = calculateCredits([uc("EXEMPT", { credits: 5 })], null);
    expect(r.breakdown.earned).toBe(5);
    expect(r.breakdown.planned).toBe(0);
    expect(r.breakdown.total).toBe(5);
  });

  it("counts IN_PROGRESS credits as PLANNED (on-track, not yet earned)", () => {
    const r = calculateCredits([uc("IN_PROGRESS", { credits: 5 })], null);
    expect(r.breakdown.planned).toBe(5);
    expect(r.breakdown.earned).toBe(0);
    expect(r.breakdown.total).toBe(5);
  });

  it("still excludes FAILED courses entirely", () => {
    const r = calculateCredits([uc("FAILED", { credits: 5 })], null);
    expect(r.breakdown.total).toBe(0);
  });

  it("attributes EXEMPT/IN_PROGRESS credits to their course-type bucket", () => {
    const r = calculateCredits(
      [uc("EXEMPT", { credits: 4, courseType: "MANDATORY" }), uc("IN_PROGRESS", { credits: 3, courseType: "ELECTIVE" })],
      null
    );
    expect(r.breakdown.mandatory).toBe(4);
    expect(r.breakdown.elective).toBe(3);
  });

  it("keeps EXEMPT out of the GPA (a graded EXEMPT course is not counted)", () => {
    const g = calculateGraduationScore([uc("EXEMPT", { credits: 4, grade: 90 })]);
    expect(g.totalGradedCourses).toBe(0);
  });
});

// A COMPLETED English CONTENT course graded below the humanities pass bar (70)
// is a failed course: it must count toward NO bucket. It previously leaked into
// elective / discipline / earned / total while (correctly) being excluded from
// the English-requirement count (#audit-r2).
describe("English content credit gating (#audit-r2)", () => {
  it("a COMPLETED English course below 70 counts toward NO bucket", () => {
    const r = calculateCredits(
      [uc("COMPLETED", { credits: 4, courseType: "ENGLISH", discipline: "ECONOMICS", grade: 65 })],
      "ECONOMICS"
    );
    expect(r.breakdown.earned).toBe(0);
    expect(r.breakdown.elective).toBe(0);
    expect(r.breakdown.total).toBe(0);
    expect(r.breakdown.focusArea).toBe(0);
  });

  it("a COMPLETED English course at/above 70 counts (earned + elective)", () => {
    const r = calculateCredits(
      [uc("COMPLETED", { credits: 4, courseType: "ENGLISH", discipline: "ECONOMICS", grade: 85 })],
      "ECONOMICS"
    );
    expect(r.breakdown.earned).toBe(4);
    expect(r.breakdown.elective).toBe(4);
  });

  it("an on-track English course (in progress, ungraded) still counts as planned", () => {
    const r = calculateCredits(
      [uc("IN_PROGRESS", { credits: 4, courseType: "ENGLISH", discipline: "ECONOMICS" })],
      "ECONOMICS"
    );
    expect(r.breakdown.planned).toBe(4);
    expect(r.breakdown.total).toBe(4);
  });
});
