// =========================================
// Binary-conversion advisor — pure math
// =========================================
// A miluim student may convert a limited number of graded courses to
// pass/fail ("בינארי"), which REMOVES them from the weighted average. This
// module computes, for each eligible course, what the average would become —
// arithmetic on the student's own grades, nothing predicted or invented.
// Domain rules (מתווה תשפ"ו): quota by group (via lib/miluim), seminars and
// final-track courses cannot be converted, honors needs binaries ≤ 25%.

import type { UserCourseWithCourse } from "@/types/degree";
import {
  calculateGrades,
  canonicalAttempts,
  countsTowardAverage,
} from "@/lib/grade-calculator";
import { passBarFor } from "@/lib/constants";

/** The display projection of an offered course — everything the card renders. */
export interface GradedCourseLite {
  userCourseId: string;
  nameHe: string;
  code: string;
  grade: number;
  credits: number;
  isBinary: boolean;
  /** e.g. "SEMINAR" — seminars can't be converted. */
  courseType?: string | null;
}

export interface BinaryCandidate {
  course: GradedCourseLite;
  newAverage: number;
  delta: number;
}

export interface BinaryAdvisorOpts {
  /** B/C/G reservists keep the HIGHER of two sittings — see canonicalAttempts. */
  preferHigherGrade?: boolean;
}

function toLite(uc: UserCourseWithCourse): GradedCourseLite {
  return {
    userCourseId: uc.id,
    nameHe: uc.course.nameHe,
    code: uc.course.code,
    grade: uc.grade!,
    credits: uc.course.credits,
    isBinary: uc.isBinary ?? false,
    courseType: uc.course.courseType,
  };
}

/**
 * The credit-weighted degree average — literally `calculateGrades().courseAverage`,
 * the ONE engine the dashboard hero, the King, /record and /graduation all read.
 *
 * It is a call, not a copy. This module used to re-implement the eligibility
 * filter by hand AND skip `canonicalAttempts`, so for any student who had retaken
 * a course the advisor averaged BOTH sittings and double-counted their ש״ס — a
 * baseline (and every "would raise it to X") computed over a different population
 * than the number on the same student's screen (audit deferred-1). Delegating
 * removes the possibility: eligibility (`countsTowardAverage` — COMPLETED, graded,
 * not SEMINAR, not ENGLISH, not already binary) and retake collapse
 * (`canonicalAttempts`) can only ever mean here what they mean everywhere else.
 */
export function weightedAverage(
  courses: UserCourseWithCourse[],
  opts?: BinaryAdvisorOpts,
): number | null {
  return calculateGrades(courses, opts).courseAverage;
}

/**
 * The rows a conversion could act on: the SAME pool the average is built from,
 * so a course the average never counted can never be offered as a way to raise
 * it. Filter-then-collapse, in that order — collapsing first would let an
 * ungraded EXEMPT/retake row win the course and then be dropped, silently
 * removing a graded course from the pool (grade-calculator carries the same note).
 */
function averagePool(
  courses: UserCourseWithCourse[],
  opts?: BinaryAdvisorOpts,
): UserCourseWithCourse[] {
  return canonicalAttempts(courses.filter(countsTowardAverage), opts);
}

/**
 * Rank the courses whose conversion would RAISE the average, best first.
 * Only genuinely eligible courses: in the average pool at all (so: graded, not
 * already binary, not a seminar, not English, the determining sitting of a
 * retake), passing (a failed course can't be converted to a "pass" — and the
 * bar is 70 for English, 60 elsewhere, via `passBarFor`), and only while the
 * student still has quota.
 *
 * `newAverage` is computed by flipping `isBinary` on that exact row and re-running
 * the canonical engine — so the promise on the card IS the number the dashboard
 * will show once the student converts, not an approximation of it.
 */
export function rankBinaryCandidates(
  courses: UserCourseWithCourse[],
  quotaRemaining: number,
  opts?: BinaryAdvisorOpts,
): { current: number | null; candidates: BinaryCandidate[] } {
  const current = weightedAverage(courses, opts);
  if (current == null || quotaRemaining <= 0) return { current, candidates: [] };

  const candidates: BinaryCandidate[] = [];
  for (const uc of averagePool(courses, opts)) {
    if (uc.course.credits <= 0) continue;
    // Failed — nothing to convert to a "pass". English sits at 70, not 60
    // (ENGLISH_CONFIG.COURSE_PASSING_GRADE); passBarFor is the one place that knows.
    if (uc.grade! < passBarFor(uc.course.courseType)) continue;
    const after = weightedAverage(
      courses.map((row) => (row.id === uc.id ? { ...row, isBinary: true } : row)),
      opts,
    );
    if (after == null) continue;
    const delta = after - current;
    if (delta <= 0) continue; // converting a good grade only hurts
    candidates.push({ course: toLite(uc), newAverage: after, delta });
  }

  candidates.sort((a, b) => b.delta - a.delta);
  return { current, candidates };
}
