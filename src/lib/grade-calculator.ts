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
export function calculateGrades(
  courses: UserCourseWithCourse[]
): GradeBreakdown {
  // Filter to completed courses with a grade.
  const completed = courses.filter(
    (uc) => uc.status === "COMPLETED" && uc.grade !== null
  );

  // ----- Course average (credit-weighted) -----
  // Exclude SEMINAR courses — their submissionGrade is counted separately
  // in the seminar paper / referat buckets below. Also exclude miluim
  // binary (pass/fail) courses — by definition their numeric grade does NOT
  // count toward the average (the course still counts for degree credit, which
  // the credit calculator handles separately).
  const gradedCourses = completed
    .filter((uc) => uc.course.courseType !== "SEMINAR" && !uc.isBinary)
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
