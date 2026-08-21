// =========================================================================
// "מה בעצם יזיז לי את הממוצע?" — ranked, with the resit date attached
// =========================================================================
// Ariel, 21.8, on the tenth asking: "מצב הסימולציה ממש לא מונגש… המצב סימולציה
// גם לא מספיק מגניב ולא מספיק עוזר ואין בו איזה תובנות או המלצות או חיבור למתי
// יש מועדי ב׳ ואיך להחליט… זה כאילו די גרוע וטכני".
//
// Fair on every count. What existed was a sandbox: nudge a grade by ±5 and
// watch a number move. That answers "what if" for a student who already knows
// which course to ask about, and is silent for the one who does not — which is
// everyone opening it for the first time. A tool that requires you to already
// have the insight is not giving you one.
//
// This computes the insight instead of waiting to be asked. For every course
// the student could still affect, it works out how much the DEGREE average
// would move, ranks them, and attaches the thing that decides whether the
// answer is actionable at all: when the second sitting actually is.
//
// Two honesty rules it holds to, both of which cut AGAINST looking impressive:
//
//  1. It reports the weight of each course in the average — usually 2-4% —
//     right next to its upside. Most levers are small, and a tool that ranks
//     them without saying so implies a leverage that is not there.
//  2. For a student whose retake REPLACES the first sitting, an improvement is
//     not free. The downside travels with the upside, never separately.

import type { UserCourseWithCourse } from "@/types/degree";
import { simulate } from "@/lib/grade-simulator";
import { countsTowardAverage } from "@/lib/grade-calculator";

export interface GradeLever {
  userCourseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  /** A grade already earned that a resit could raise, or one not yet given. */
  kind: "retake" | "upcoming";
  currentGrade: number | null;
  /** Share of the credit-weighted average this course carries, as a percent. */
  weightPct: number;
  /** Degree average if this course reached `assumedGrade`. */
  averageIfImproved: number | null;
  /** Points the average would gain. Never negative. */
  upside: number;
  /** The grade the upside assumes. */
  assumedGrade: number;
}

export interface LeverOptions {
  /** B/C/G reservists keep the higher sitting — changes what a retake risks. */
  keepsHigherGrade: boolean;
  /**
   * The grade to assume a retake or an upcoming course achieves. Deliberately
   * NOT 100: an upside computed from a perfect score is a number nobody will
   * see, and it ranks courses by how far they are from perfect rather than by
   * how much they can actually move.
   */
  assumedGrade?: number;
}

const DEFAULT_ASSUMED = 95;

/**
 * Every course that could still move the average, best first.
 *
 * A course already at or above the assumed grade is left out — there is no
 * lever there, and listing it as a zero-upside row is noise dressed as advice.
 */
export function gradeLevers(
  courses: UserCourseWithCourse[],
  opts: LeverOptions,
): GradeLever[] {
  const assumed = opts.assumedGrade ?? DEFAULT_ASSUMED;
  const counted = courses.filter(countsTowardAverage);
  const totalCredits = counted.reduce((s, c) => s + (c.course.credits ?? 0), 0);
  if (totalCredits <= 0) return [];

  const out: GradeLever[] = [];

  for (const uc of courses) {
    // Only courses whose TYPE counts — a seminar or an English course cannot
    // move this average no matter what grade it gets.
    if (!countsTowardAverage(uc) && !(uc.grade == null && uc.status !== "COMPLETED")) continue;

    const graded = uc.grade != null && uc.status === "COMPLETED";
    if (graded && uc.grade! >= assumed) continue; // already above — no lever

    const sim = simulate(
      courses,
      { [uc.id]: { grade: assumed } },
      { preferHigherGrade: opts.keepsHigherGrade },
    );
    const before = sim.current.courseAverage;
    const after = sim.simulated.courseAverage;
    if (before == null || after == null) continue;

    const upside = Math.round((after - before) * 100) / 100;
    if (upside <= 0) continue;

    out.push({
      userCourseId: uc.id,
      courseCode: uc.course.code,
      courseName: uc.course.nameHe,
      credits: uc.course.credits ?? 0,
      kind: graded ? "retake" : "upcoming",
      currentGrade: graded ? uc.grade : null,
      weightPct: Math.round(((uc.course.credits ?? 0) / totalCredits) * 1000) / 10,
      averageIfImproved: Math.round(after * 100) / 100,
      upside,
      assumedGrade: assumed,
    });
  }

  return out.sort((a, b) => b.upside - a.upside);
}

/**
 * The one sentence worth leading with, or null when there is nothing to say.
 *
 * Deliberately reports the TOTAL reachable movement alongside the single best
 * lever, because the honest headline for most students is that no individual
 * course changes much — and they deserve to learn that here rather than after
 * giving up a summer.
 */
export function leverSummary(levers: GradeLever[]): {
  best: GradeLever;
  /** Combined upside if EVERY listed lever went the assumed way. */
  totalUpside: number;
} | null {
  if (levers.length === 0) return null;
  return {
    best: levers[0]!,
    totalUpside: Math.round(levers.reduce((s, l) => s + l.upside, 0) * 100) / 100,
  };
}
