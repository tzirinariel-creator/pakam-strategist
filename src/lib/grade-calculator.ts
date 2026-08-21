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
import { isEnglishCourse } from "@/lib/english-standing";

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
    // Ariel, 21.8, having said it several times: "אל תשכח שאנגלית לא נחשב
    // בממוצע" — and it still was.
    //
    // The rule was right and the test for it was too narrow: this asked only
    // whether courseType === "ENGLISH". His English course reached the
    // database through the grade-sheet scanner, which creates rows as
    // ELECTIVE, so the one filter that mattered never fired and
    // "מתקדמים ב' חוצה דיצפלינות בין תחומי" was averaged into his degree.
    //
    // isEnglishCourse now answers this for the whole app — the catalog flag,
    // the name, and TAU's 2171 English-unit code — so a row cannot be English
    // on the record screen and not English in the average.
    !isEnglishCourse(uc.course) &&
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
export function canonicalAttempts(
  rows: UserCourseWithCourse[],
  opts?: { preferHigherGrade?: boolean },
): UserCourseWithCourse[] {
  // MILUIM (Ariel 23.7): reservist groups B/C/G have the right to sit 2 of 3
  // exam dates with the HIGHER grade kept automatically (docs/pakam-domain-
  // rules-2026.md Layer B; constants.ts examChoice2of3=true for B/C/G, false
  // for A/NONE). When preferHigherGrade is set (resolved from the student's
  // current group), a course's determining attempt is the HIGHER-graded sitting
  // instead of the last one — so the average the app SHOWS finally matches the
  // rule the app PROMISES these students. A / NONE keep the standard last-grade.
  const preferHigher = opts?.preferHigherGrade ?? false;
  const best = new Map<string, UserCourseWithCourse>();
  const isEarned = (uc: UserCourseWithCourse) => uc.status === "COMPLETED" || uc.status === "EXEMPT";
  for (const uc of rows) {
    const prev = best.get(uc.courseId);
    if (!prev) {
      best.set(uc.courseId, uc);
      continue;
    }
    // Prefer an EARNED attempt over a not-yet-earned one, so a passed course
    // being retaken to improve isn't demoted from earned to planned (#audit-r6).
    let better: boolean;
    if (isEarned(uc) !== isEarned(prev)) {
      better = isEarned(uc);
    } else if (
      preferHigher &&
      uc.grade != null &&
      prev.grade != null &&
      uc.grade !== prev.grade
    ) {
      // B/C/G: keep the HIGHER of two graded sittings.
      better = uc.grade > prev.grade;
    } else {
      // Standard rule: the highest attemptNumber (the LAST sitting) wins.
      better = uc.attemptNumber > prev.attemptNumber;
    }
    if (better) best.set(uc.courseId, uc);
  }
  return [...best.values()];
}

export function calculateGrades(
  courses: UserCourseWithCourse[],
  opts?: { preferHigherGrade?: boolean },
): GradeBreakdown {
  // ----- Course average (credit-weighted) -----
  // Collapse retakes to the determining attempt first, so a grade-improvement
  // retake contributes ONE grade (the latest — or the HIGHER one for B/C/G
  // reservists, opts.preferHigherGrade), not both (#audit-r5).
  const gradedCourses = canonicalAttempts(courses.filter(countsTowardAverage), opts)
    .map((uc) => ({
      grade: uc.grade!,
      weight: uc.course.credits,
    }));

  const courseAverage = weightedAverage(gradedCourses);
  const completedCredits = gradedCourses.reduce((s, c) => s + c.weight, 0);

  // ----- Seminar papers -----
  // Seminar papers are courses of type SEMINAR with submissionType PAPER and
  // a non-null submissionGrade.
  //
  // Collapse resubmissions to the DETERMINING (highest-attemptNumber) row first.
  // A resubmitted seminar paper is stored as a second COMPLETED row, exactly
  // like a course retake — and without this both grades were averaged into the
  // 18% seminar component, so a 60 improved to a 90 scored as a 75. The referat
  // branch below already took the highest attempt, and PKM-008 already counts
  // DISTINCT seminar courses (#audit-r6); this is the same collapse, applied to
  // the number that actually moves the graduation score.
  //
  // NOTE: deliberately NOT `preferHigherGrade`. The B/C/G reservist right is
  // "2 of 3 EXAM dates, the higher counts" (domain §6 Layer B) — it says nothing
  // about seminar papers, so the standard last-attempt rule stands for papers.
  const seminarPaperGrades = canonicalAttempts(
    courses.filter(
      (uc) =>
        uc.status === "COMPLETED" &&
        uc.course.courseType === "SEMINAR" &&
        uc.submissionType === "PAPER" &&
        uc.submissionGrade !== null
    )
  ).map((uc) => uc.submissionGrade!);

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
