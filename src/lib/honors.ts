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

/**
 * CORRECTED 21.8. This was 95 and it was simply wrong.
 *
 * Ariel: "יש פה טעות על ההצטיינות. מצטיין דקאן זה לרוב 97 ומעלה. מצטיין רקטור
 * זה 98 ומעלה. והכול הערכות. 97 ומעלה - 3 אחוז הכי טובים בפכ״מ. ורקטור זה
 * לדעתי 98 ומעלה וזה ה-3 אחוז הכי טובים בפקולטה."
 *
 * Two separate mistakes were bundled into that 95:
 *   1. The NUMBER was too low, so the app told students they were "at or above
 *      the honours bar" when they were nearly two points below where the cut
 *      has actually landed. That is the worst direction to be wrong in.
 *   2. Modelling it as A BAR AT ALL. Both distinctions are the top ~3% of a
 *      cohort, decided after the year closes. 97 and 98 are where the cut has
 *      HAPPENED to fall — they are outcomes, not thresholds.
 *
 * The constant survives only as the yardstick for the distance meter, so the
 * bar graph has something to draw against. Every sentence around it must say
 * "roughly where it has landed", never "the bar".
 */
export const HONORS_YEARLY_BAR = 97;

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

// =========================================================================
// 21.8 — what טל actually said, and why 95 is not a bar
// =========================================================================
// Everything above models a DISTANCE to a 95 cut-off, which is the right shape
// for "how far am I" but the wrong shape for "am I in". Ariel's notes from
// טל, the PPE secretary, and his instruction to treat the whole subject
// "בערבון מוגבל":
//
//   · "סביב מרץ הם בודקות לגבי רשימת המצטיינים … סביב מרץ הם ידעו מה החתך"
//   · "הצטיינות דקאן — 3% הכי טובים מהתוכנית … תחת מכסה של בערך 5 מצטיינים"
//   · "הצטיינות דקאן היא לרוב 97"
//   · "הצטיינות רקטור — בערך 3% מכל הפקולטה … אחד קיבל עם ממוצע מעל 98"
//   · "ציון גמר בהצטיינות … תוענק ל-15%. כל מי שהיה לו ציון מעל 92"
//
// The load-bearing fact: these are PERCENTILES against a cohort, settled after
// the year closes. 97 and 92 are what the cut-off HAPPENED to be, not rules.
// 97.4 is not "in" and 96.8 is not "out" — nobody knows until March, including
// her. HONORS_YEARLY_BAR stays as the app's approximation for the distance
// meter; what follows is the honest vocabulary for talking about the outcome.
// Same principle the app already applies to bidding points: where the true
// number is unpublished, predicting it is harmful.

export interface HonorsBand {
  id: "dean" | "rector" | "degree-honors";
  /** Typical historical cut-off. NOT a threshold — see the note above. */
  typicalAverage: number;
  /** Roughly what share of the cohort it has gone to. */
  cohortShare: string;
}

/** What טל described, recorded as history rather than as rules. */
export const HONORS_BANDS: HonorsBand[] = [
  // Dean's list: top ~3% OF THE פכ״מ PROGRAM. Has landed around 97.
  { id: "dean", typicalAverage: 97, cohortShare: "כ-3% מתוכנית פכ״מ" },
  // Rector's list: top ~3% OF THE WHOLE FACULTY — a much larger pool, which is
  // why Ariel notes it is "קצת חסר סיכוי" for a PPE student. Around 98.
  { id: "rector", typicalAverage: 98, cohortShare: "כ-3% מכל הפקולטה" },
  // A degree awarded with honours: ~15% of those finishing, around 92.
  { id: "degree-honors", typicalAverage: 92, cohortShare: "כ-15% מהמסיימים" },
];

/** The month the lists are actually decided, per טל. */
export const HONORS_DECIDED_MONTH = 3; // March

export type HonorsProximity =
  /** Above every historical cut-off — still not a promise. */
  | "above-historical"
  /** Within reach of at least one historical cut-off. */
  | "near-historical"
  /** Below the lowest historical cut-off. */
  | "below-historical"
  /** Not enough graded credits to say anything at all. */
  | "unknown";

/**
 * Where a yearly average sits RELATIVE TO HISTORY — never a verdict.
 *
 * `yearlyAverage` must be a YEARLY average: honours is judged per year, and
 * comparing a whole-degree average to these numbers is a category error the
 * old copy made.
 */
export function honorsProximity(yearlyAverage: number | null): HonorsProximity {
  if (yearlyAverage == null || !Number.isFinite(yearlyAverage)) return "unknown";
  const lowest = Math.min(...HONORS_BANDS.map((b) => b.typicalAverage));
  const highest = Math.max(...HONORS_BANDS.map((b) => b.typicalAverage));
  if (yearlyAverage >= highest) return "above-historical";
  if (yearlyAverage >= lowest - 1) return "near-historical";
  return "below-historical";
}

/**
 * Is it worth telling the student to go ASK? טל checks the lists around March,
 * and that is the only moment the real cut-off exists.
 *
 * `month` is 1-12, injected so this stays pure.
 */
export function shouldPromptToAskAboutHonors(month: number, proximity: HonorsProximity): boolean {
  if (proximity === "unknown" || proximity === "below-historical") return false;
  // From February, so the student hears it BEFORE the lists are drawn and can
  // still decide about binaries — which is the whole reason the timing matters.
  return month >= 2 && month <= 4;
}
