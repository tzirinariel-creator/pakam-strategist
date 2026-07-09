// =========================================
// Grade Calculation Engine
// =========================================
// Pure function that computes the weighted graduation
// score (PKM-013) from the user's course list.
//
// Formula:
//   graduationScore =
//       courseAvg   * GRADE_WEIGHTS.COURSES
//     + seminarAvg  * GRADE_WEIGHTS.SEMINAR_PAPERS
//     + referatGrade * GRADE_WEIGHTS.REFERAT

import type { UserCourseWithCourse, GradeBreakdown } from "@/types/degree";
import { GRADE_WEIGHTS } from "@/lib/constants";

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

/**
 * Compute a credit-weighted average over courses that have a numeric grade.
 * Returns null when no graded courses exist.
 */
function weightedAverage(
  items: { grade: number; weight: number }[]
): number | null {
  if (items.length === 0) return null;

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight === 0) return null;

  const weightedSum = items.reduce((sum, i) => sum + i.grade * i.weight, 0);
  return weightedSum / totalWeight;
}

/**
 * Simple (unweighted) average. Returns null for empty arrays.
 */
function simpleAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// -------------------------------------------------------------------
// Main calculation
// -------------------------------------------------------------------

/**
 * Calculate the full grade breakdown and weighted graduation score.
 *
 * Only COMPLETED courses with a non-null grade are considered.
 *
 * - Course average: credit-weighted mean of all graded course grades
 *   (excluding seminar submission grades -- those go into the seminar / referat buckets).
 * - Seminar paper average: simple mean of submissionGrade for seminar courses
 *   where submissionType === "PAPER".
 * - Referat grade: the single submissionGrade where submissionType === "REFERAT".
 *   If multiple referats exist, we take the most recent (highest attemptNumber).
 */
/**
 * The single source of truth for "does this course's numeric grade count toward
 * the credit-weighted degree average?" Every surface (dashboard hero, the King,
 * /graduation, /record) MUST use this so they never disagree.
 * Excludes: non-completed / ungraded; SEMINAR (its grade is in the seminar
 * buckets); miluim binary/pass-fail (grade removed by design); and ENGLISH
 * (owner-verified 4.7 — English grades do NOT count toward the PPE average).
 */
/** Type-level average eligibility (ignores status/grade): a course whose TYPE
 *  counts toward the credit-weighted course average — not a seminar, not English,
 *  not a binary/pass-fail conversion. Used to project a target average onto
 *  not-yet-graded PLANNED courses (the reverse calculator) without a grade req. */
export function courseTypeCountsTowardAverage(uc: UserCourseWithCourse): boolean {
  return (
    uc.course.courseType !== "SEMINAR" &&
    uc.course.courseType !== "ENGLISH" &&
    !uc.isBinary
  );
}

export function countsTowardAverage(uc: UserCourseWithCourse): boolean {
  return uc.status === "COMPLETED" && uc.grade !== null && courseTypeCountsTowardAverage(uc);
}

/**
 * Collapse retake attempts to ONE row per course — the DETERMINING (highest
 * attemptNumber) sitting. The app supports grade-improvement retakes (a second
 * COMPLETED row, attemptNumber 2), and TAU counts the LAST attempt's grade, so
 * without this a retake double-counts its credits AND averages both grades
 * (#audit-r5). Call on an ALREADY-filtered set (e.g. COMPLETED-graded, or
 * countable) so a still-failed earlier attempt outside the set can't win.
 */
export function canonicalAttempts(rows: UserCourseWithCourse[]): UserCourseWithCourse[] {
  const best = new Map<string, UserCourseWithCourse>();
  for (const uc of rows) {
    const prev = best.get(uc.courseId);
    if (!prev || uc.attemptNumber > prev.attemptNumber) best.set(uc.courseId, uc);
  }
  return [...best.values()];
}

export function calculateGrades(
  courses: UserCourseWithCourse[]
): GradeBreakdown {
  // ----- Course average (credit-weighted) -----
  // Collapse retakes to the determining attempt first, so a grade-improvement
  // retake contributes ONE grade (the latest), not both (#audit-r5).
  const gradedCourses = canonicalAttempts(courses.filter(countsTowardAverage))
    .map((uc) => ({
      grade: uc.grade!,
      weight: uc.course.credits,
    }));

  const courseAverage = weightedAverage(gradedCourses);
  const completedCredits = gradedCourses.reduce((s, c) => s + c.weight, 0);

  // ----- Seminar papers -----
  // Seminar papers are courses of type SEMINAR with submissionType PAPER and
  // a non-null submissionGrade.
  const seminarPaperGrades = courses
    .filter(
      (uc) =>
        uc.status === "COMPLETED" &&
        uc.course.courseType === "SEMINAR" &&
        uc.submissionType === "PAPER" &&
        uc.submissionGrade !== null
    )
    .map((uc) => uc.submissionGrade!);

  const seminarPaperAverage = simpleAverage(seminarPaperGrades);

  // ----- Referat -----
  // Take the referat with the highest attempt number (most recent).
  const referatCourses = courses
    .filter(
      (uc) =>
        uc.status === "COMPLETED" &&
        uc.course.courseType === "SEMINAR" &&
        uc.submissionType === "REFERAT" &&
        uc.submissionGrade !== null
    )
    .sort((a, b) => b.attemptNumber - a.attemptNumber);

  const referatEntry = referatCourses.length > 0 ? referatCourses[0] : null;
  const referatGrade = referatEntry?.submissionGrade ?? null;

  // ----- Weighted graduation score -----
  // All three components must be available to produce a final score.
  let weightedScore: number | null = null;

  if (
    courseAverage !== null &&
    seminarPaperAverage !== null &&
    referatGrade !== null
  ) {
    weightedScore =
      courseAverage * GRADE_WEIGHTS.COURSES +
      seminarPaperAverage * GRADE_WEIGHTS.SEMINAR_PAPERS +
      referatGrade * GRADE_WEIGHTS.REFERAT;
  }

  return {
    courseAverage,
    seminarPaperAverage,
    referatGrade,
    weightedScore,
    completedCredits,
    totalGradedCourses: gradedCourses.length,
  };
}

// -------------------------------------------------------------------
// Alias expected by the plan router
// -------------------------------------------------------------------

/** Alias for calculateGrades, used in server routes. */
export const calculateGraduationScore = calculateGrades;

// -------------------------------------------------------------------
// Utility: round a score to two decimal places for display
// -------------------------------------------------------------------

export function roundScore(score: number | null | undefined): number | null {
  if (score == null || isNaN(score)) return null;
  return Math.round(score * 100) / 100;
}
