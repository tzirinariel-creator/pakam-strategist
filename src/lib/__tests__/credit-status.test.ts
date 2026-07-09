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
  opts: { credits?: number; courseType?: string; discipline?: string; grade?: number | null; courseId?: string; attemptNumber?: number } = {}
): UserCourseWithCourse {
  seq += 1;
  const courseType = opts.courseType ?? "ELECTIVE";
  const courseId = opts.courseId ?? `c-${seq}`;
  return {
    id: `uc-${seq}`,
    userId: "u",
    courseId,
    status,
    grade: opts.grade ?? null,
    plannedYear: 2,
    plannedSemester: "FALL",
    attemptNumber: opts.attemptNumber ?? 1,
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

// A grade-improvement retake creates a SECOND COMPLETED row (attemptNumber 2)
// for the same course. Neither the credits nor the grade may be double-counted;
// only the determining (latest) attempt counts (#audit-r5).
describe("grade-improvement retake is not double-counted (#audit-r5)", () => {
  const rows = [
    uc("COMPLETED", { courseId: "dup", attemptNumber: 1, credits: 4, courseType: "ELECTIVE", discipline: "ECONOMICS", grade: 68 }),
    uc("COMPLETED", { courseId: "dup", attemptNumber: 2, credits: 4, courseType: "ELECTIVE", discipline: "ECONOMICS", grade: 85 }),
  ];

  it("counts the credits ONCE (earned/elective/focus = 4, not 8)", () => {
    const c = calculateCredits(rows, "ECONOMICS");
    expect(c.breakdown.earned).toBe(4);
    expect(c.breakdown.elective).toBe(4);
    expect(c.breakdown.focusArea).toBe(4);
    expect(c.breakdown.total).toBe(4);
  });

  it("averages only the determining (latest) grade, not both", () => {
    const g = calculateGraduationScore(rows);
    expect(g.courseAverage).toBe(85); // the retake, not (68+85)/2 = 76.5
    expect(g.totalGradedCourses).toBe(1);
  });

  it("a passed course being retaken (attempt 2 in progress) keeps its EARNED credits", () => {
    // The collapse must prefer the EARNED attempt — a retake-in-progress must not
    // demote already-earned credits to planned (#audit-r6 regression fix).
    const retaking = [
      uc("COMPLETED", { courseId: "retk", attemptNumber: 1, credits: 4, courseType: "ELECTIVE", discipline: "ECONOMICS", grade: 65 }),
      uc("IN_PROGRESS", { courseId: "retk", attemptNumber: 2, credits: 4, courseType: "ELECTIVE", discipline: "ECONOMICS" }),
    ];
    const c = calculateCredits(retaking, "ECONOMICS");
    expect(c.breakdown.earned).toBe(4);
    expect(c.breakdown.planned).toBe(0);
    expect(c.breakdown.total).toBe(4);
  });
});
