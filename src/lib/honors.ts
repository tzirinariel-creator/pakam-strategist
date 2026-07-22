// =========================================================================
// Note #25 — "distance to honors" (approved modeling, docs/המלצות-בעלים-11.7.md).
// Dean's-list ≈ yearly WEIGHTED average 95 in humanities (roughly the top 3%),
// Rector = same bar + full-time both semesters. Measured PER STUDY YEAR.
// The bar is policy that changes yearly → every consumer must show the
// "נכון לתשפ"ו" tag and treat 95 as an approximation of a percentile cutoff,
// never a promise. The official transcript has NO honors field — this is a
// computed aid, not a status.
//
// Same average semantics as the degree GPA: binary and English excluded
// (countsTowardAverage), retakes resolved to the determining attempt.
// =========================================================================

import { countsTowardAverage, canonicalAttempts } from "@/lib/grade-calculator";
import { prefersHigherGrade, type MiluimGroupKey } from "@/lib/miluim";
import type { UserCourseWithCourse } from "@/types/degree";

/** The dean's-list yearly weighted-average bar — נכון לתשפ"ו, yearly policy. */
export const HONORS_YEARLY_BAR = 95;

/** Converting >25% of a year's hours to binary forfeits honors (domain §6). */
export const HONORS_BINARY_SHARE_CAP = 0.25;

export interface HonorsDistance {
  /** The study year measured (plannedYear). */
  year: number;
  /** Credit-weighted average of that year's counted grades, or null if none. */
  yearlyAverage: number | null;
  /** Graded courses included. */
  courseCount: number;
  /** Credits included. */
  credits: number;
  /** Positive = points still missing to the bar; 0 = at/above it. */
  gap: number | null;
}

/**
 * The student's current-year weighted average vs the honors bar. Pure —
 * feed it the plan rows and the study year.
 */
export function computeHonorsDistance(
  courses: UserCourseWithCourse[],
  year: number,
  miluimGroup?: MiluimGroupKey | string | null,
): HonorsDistance {
  const yearCourses = canonicalAttempts(
    courses.filter(
      (uc) =>
        uc.plannedYear === year &&
        uc.status === "COMPLETED" &&
        uc.grade !== null &&
        countsTowardAverage(uc),
    ),
    // Honors is the same average as the GPA — so a B/C/G reservist's higher
    // grade must count here too, or the honors gap would understate them.
    { preferHigherGrade: prefersHigherGrade((miluimGroup ?? "NONE") as MiluimGroupKey) },
  );

  let weighted = 0;
  let credits = 0;
  for (const uc of yearCourses) {
    const c = uc.course.credits ?? 0;
    weighted += (uc.grade ?? 0) * c;
    credits += c;
  }

  const yearlyAverage = credits > 0 ? weighted / credits : null;
  return {
    year,
    yearlyAverage,
    courseCount: yearCourses.length,
    credits,
    gap: yearlyAverage === null ? null : Math.max(0, HONORS_YEARLY_BAR - yearlyAverage),
  };
}
