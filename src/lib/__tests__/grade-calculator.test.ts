import { describe, it, expect } from "vitest";
import { calculateGrades, roundScore } from "@/lib/grade-calculator";
import { GRADE_WEIGHTS } from "@/lib/constants";
import type { UserCourseWithCourse } from "@/types/degree";

/**
 * Build a minimal UserCourseWithCourse for the fields calculateGrades reads.
 * Cast through `unknown` so we don't have to populate every DB column.
 */
function uc(over: {
  status?: string;
  grade?: number | null;
  credits?: number;
  courseType?: string;
  submissionType?: string | null;
  submissionGrade?: number | null;
  attemptNumber?: number;
}): UserCourseWithCourse {
  return {
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? null,
    submissionType: over.submissionType ?? null,
    submissionGrade: over.submissionGrade ?? null,
    attemptNumber: over.attemptNumber ?? 1,
    course: {
      courseType: over.courseType ?? "MANDATORY",
      credits: over.credits ?? 3,
    },
  } as unknown as UserCourseWithCourse;
}

describe("calculateGrades", () => {
  it("returns all-null for an empty course list", () => {
    const r = calculateGrades([]);
    expect(r.courseAverage).toBeNull();
    expect(r.seminarPaperAverage).toBeNull();
    expect(r.referatGrade).toBeNull();
    expect(r.weightedScore).toBeNull();
    expect(r.completedCredits).toBe(0);
    expect(r.totalGradedCourses).toBe(0);
  });

  it("computes a credit-weighted course average", () => {
    const r = calculateGrades([
      uc({ grade: 90, credits: 4 }),
      uc({ grade: 80, credits: 2 }),
    ]);
    // (90*4 + 80*2) / (4+2) = 520 / 6
    expect(r.courseAverage).toBeCloseTo(520 / 6, 5);
    expect(r.completedCredits).toBe(6);
    expect(r.totalGradedCourses).toBe(2);
  });

  it("ignores courses that are not COMPLETED or have no grade", () => {
    const r = calculateGrades([
      uc({ grade: 100, credits: 3, status: "PLANNED" }),
      uc({ grade: null, credits: 3, status: "COMPLETED" }),
      uc({ grade: 70, credits: 3, status: "COMPLETED" }),
    ]);
    expect(r.courseAverage).toBe(70);
    expect(r.totalGradedCourses).toBe(1);
  });

  it("excludes SEMINAR courses from the course average", () => {
    const r = calculateGrades([
      uc({ grade: 60, credits: 4, courseType: "MANDATORY" }),
      uc({ grade: 100, credits: 4, courseType: "SEMINAR" }),
    ]);
    expect(r.courseAverage).toBe(60); // seminar grade excluded
  });

  it("averages seminar papers (simple mean)", () => {
    const r = calculateGrades([
      uc({ courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 90 }),
      uc({ courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 80 }),
    ]);
    expect(r.seminarPaperAverage).toBe(85);
  });

  it("picks the referat with the highest attempt number", () => {
    const r = calculateGrades([
      uc({ courseType: "SEMINAR", submissionType: "REFERAT", submissionGrade: 70, attemptNumber: 1 }),
      uc({ courseType: "SEMINAR", submissionType: "REFERAT", submissionGrade: 95, attemptNumber: 2 }),
    ]);
    expect(r.referatGrade).toBe(95);
  });

  it("produces a weighted score only when all three components exist", () => {
    const courseOnly = calculateGrades([uc({ grade: 90, credits: 3 })]);
    expect(courseOnly.weightedScore).toBeNull();

    const full = calculateGrades([
      uc({ grade: 90, credits: 3 }),
      uc({ courseType: "SEMINAR", submissionType: "PAPER", submissionGrade: 80 }),
      uc({ courseType: "SEMINAR", submissionType: "REFERAT", submissionGrade: 100 }),
    ]);
    const expected =
      90 * GRADE_WEIGHTS.COURSES +
      80 * GRADE_WEIGHTS.SEMINAR_PAPERS +
      100 * GRADE_WEIGHTS.REFERAT;
    expect(full.weightedScore).toBeCloseTo(expected, 5);
  });
});

describe("roundScore", () => {
  it("rounds to two decimals", () => {
    expect(roundScore(86.6666)).toBe(86.67);
    expect(roundScore(90)).toBe(90);
  });

  it("returns null for null/undefined/NaN", () => {
    expect(roundScore(null)).toBeNull();
    expect(roundScore(undefined)).toBeNull();
    expect(roundScore(NaN)).toBeNull();
  });
});
