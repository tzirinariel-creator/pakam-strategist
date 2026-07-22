import { describe, it, expect } from "vitest";
import { calculateGrades, canonicalAttempts, roundScore } from "@/lib/grade-calculator";
import { GRADE_WEIGHTS } from "@/lib/constants";
import { prefersHigherGrade } from "@/lib/miluim";
import type { UserCourseWithCourse } from "@/types/degree";

/**
 * Build a minimal UserCourseWithCourse for the fields calculateGrades reads.
 * Cast through `unknown` so we don't have to populate every DB column.
 */
let gcSeq = 0;
function uc(over: {
  status?: string;
  grade?: number | null;
  credits?: number;
  courseType?: string;
  submissionType?: string | null;
  submissionGrade?: number | null;
  attemptNumber?: number;
  isBinary?: boolean;
  courseId?: string;
}): UserCourseWithCourse {
  gcSeq += 1;
  // Every course has a DISTINCT courseId (as in the DB) unless a test shares one
  // to model retake attempts — the calculators collapse same-courseId rows.
  const courseId = over.courseId ?? `gc-${gcSeq}`;
  return {
    id: `ucg-${gcSeq}`,
    courseId,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? null,
    submissionType: over.submissionType ?? null,
    submissionGrade: over.submissionGrade ?? null,
    attemptNumber: over.attemptNumber ?? 1,
    isBinary: over.isBinary ?? false,
    course: {
      id: courseId,
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

  it("excludes miluim binary (pass/fail) courses from the course average", () => {
    const r = calculateGrades([
      uc({ grade: 90, credits: 4 }),
      uc({ grade: 50, credits: 4, isBinary: true }), // pass/fail — numeric grade excluded
    ]);
    expect(r.courseAverage).toBe(90);
    expect(r.totalGradedCourses).toBe(1);
    expect(r.completedCredits).toBe(4);
  });

  it("excludes ENGLISH courses from the course average (owner-verified #36)", () => {
    const r = calculateGrades([
      uc({ grade: 90, credits: 4, courseType: "MANDATORY" }),
      uc({ grade: 60, credits: 2, courseType: "ENGLISH" }), // English grade must NOT drag the average down
    ]);
    expect(r.courseAverage).toBe(90);
    expect(r.totalGradedCourses).toBe(1);
    expect(r.completedCredits).toBe(4);
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

// ---------------------------------------------------------------------------
// MILUIM: B/C/G reservists sit 2-of-3 exam dates and the HIGHER grade counts
// automatically (Ariel 23.7; docs/pakam-domain-rules-2026.md; constants.ts
// examChoice2of3=true for B/C/G, false for A/NONE). The engine must show the
// SAME rule it promises these students — the higher of two graded sittings,
// not the last one. NONE / GROUP_A keep the standard last-sitting rule.
// ---------------------------------------------------------------------------
describe("canonicalAttempts — miluim higher-grade rule", () => {
  // A reservist who scored HIGHER on the first sitting (85) than the retake (70).
  const attempts = (): UserCourseWithCourse[] => [
    uc({ courseId: "shared", grade: 85, credits: 3, attemptNumber: 1 }),
    uc({ courseId: "shared", grade: 70, credits: 3, attemptNumber: 2 }),
  ];

  it("keeps the LAST sitting by default (standard rule, A/NONE)", () => {
    const rows = canonicalAttempts(attempts());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.grade).toBe(70); // last attempt wins
  });

  it("keeps the HIGHER grade when preferHigherGrade is set (B/C/G)", () => {
    const rows = canonicalAttempts(attempts(), { preferHigherGrade: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.grade).toBe(85); // higher of the two graded sittings wins
  });

  it("still prefers an EARNED attempt over a not-yet-earned one, even with the flag", () => {
    // A passed course being retaken (planned) must not be demoted to planned.
    const rows = canonicalAttempts(
      [
        uc({ courseId: "shared", grade: 88, credits: 3, attemptNumber: 1, status: "COMPLETED" }),
        uc({ courseId: "shared", grade: null, credits: 3, attemptNumber: 2, status: "PLANNED" }),
      ],
      { preferHigherGrade: true },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.grade).toBe(88);
    expect(rows[0]!.status).toBe("COMPLETED");
  });

  it("flows through calculateGrades: reservist's higher grade lifts the average", () => {
    const courses = attempts();
    const standard = calculateGrades(courses);
    const reservist = calculateGrades(courses, { preferHigherGrade: true });
    expect(standard.courseAverage).toBe(70);
    expect(reservist.courseAverage).toBe(85);
    // one course either way — the retake never double-counts its credits
    expect(standard.totalGradedCourses).toBe(1);
    expect(reservist.totalGradedCourses).toBe(1);
  });
});

describe("prefersHigherGrade — group→rule mapping", () => {
  it("is false for NONE and GROUP_A (standard last-sitting)", () => {
    expect(prefersHigherGrade("NONE")).toBe(false);
    expect(prefersHigherGrade("GROUP_A")).toBe(false);
    expect(prefersHigherGrade(null)).toBe(false);
    expect(prefersHigherGrade(undefined)).toBe(false);
  });

  it("is true for GROUP_B, GROUP_C, GROUP_G (2-of-3, higher counts)", () => {
    expect(prefersHigherGrade("GROUP_B")).toBe(true);
    expect(prefersHigherGrade("GROUP_C")).toBe(true);
    expect(prefersHigherGrade("GROUP_G")).toBe(true);
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
