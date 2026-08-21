// =========================================================================
// "מה יקרה לממוצע אם…" — a sandbox, never a promise
// =========================================================================
// Ariel sent screenshots of an app he admired and asked for the same idea here:
// "סימולציות של מועדי ב׳ … בינארי, וכל מה שמישהו שצריך לדעת אם לגשת למועד ב
// או לא ובכללי מה מצבו ומה יכול להיות מצבו".
//
// That last question is the one worth building for. "Should I sit מועד ב׳?" is
// a real decision with a real cost — weeks of studying — and today a student
// answers it by guessing. Here they can set the grade they think they'd get and
// watch the actual number move.
//
// THE CORRECTNESS PROPERTY, and the reason this file is thin:
// a simulator that computes averages its own way is a liar. Every number here
// goes through `calculateGrades` — the same function the dashboard, the record
// and the graduation screen use — with a MODIFIED COPY of the courses. So the
// "current" figure the simulator shows is bit-identical to the one on the home
// screen, and the "new" figure is what the app would genuinely show if the
// scenario came true. Retake collapsing, binary exclusion, English exclusion
// and the reservist higher-grade rule all keep applying, for free, because we
// never reimplemented them.
//
// Nothing here writes. The caller holds the overrides in component state and
// throws them away on exit.

import { calculateGrades, countsTowardAverage, canonicalAttempts } from "@/lib/grade-calculator";
import type { UserCourseWithCourse, GradeBreakdown } from "@/types/degree";

/** What the student changed about one course, in the sandbox only. */
export interface CourseOverride {
  /** A hypothetical grade. null clears it back to "no grade". */
  grade?: number | null;
  /** Pretend this course is / isn't counted at all. */
  included?: boolean;
  /** Pretend it was converted to binary (leaves the average entirely). */
  isBinary?: boolean;
}

export type OverrideMap = Record<string, CourseOverride>;

export interface SimulationResult {
  /** The real breakdown, untouched — what the rest of the app shows today. */
  current: GradeBreakdown;
  /** The breakdown under the student's what-ifs. */
  simulated: GradeBreakdown;
  /** simulated − current, on the course average. null when either is unknown. */
  averageDelta: number | null;
  /** How many courses the student actually changed (excluded ones included). */
  changedCount: number;
  /** Courses deliberately left out of the calculation. */
  excludedCount: number;
}

const GRADE_MIN = 0;
const GRADE_MAX = 100;

/** Keep a nudged grade inside a real grade's range. */
export function clampGrade(n: number): number {
  return Math.max(GRADE_MIN, Math.min(GRADE_MAX, Math.round(n)));
}

/**
 * Apply the overrides to a COPY of the plan. Never mutates its input — the
 * caller's real course list has to stay pristine, because it is the same array
 * the rest of the screen renders from.
 */
export function applyOverrides(
  courses: UserCourseWithCourse[],
  overrides: OverrideMap,
): UserCourseWithCourse[] {
  const out: UserCourseWithCourse[] = [];
  for (const uc of courses) {
    const o = overrides[uc.id];
    if (!o) { out.push(uc); continue; }
    if (o.included === false) continue; // pretend it isn't there at all
    const grade = o.grade !== undefined ? o.grade : uc.grade;
    out.push({
      ...uc,
      grade: grade == null ? null : clampGrade(grade),
      // A hypothetical grade implies the course is done — otherwise
      // countsTowardAverage would drop it and the nudge would do nothing.
      status: grade == null ? uc.status : "COMPLETED",
      isBinary: o.isBinary !== undefined ? o.isBinary : uc.isBinary,
    } as UserCourseWithCourse);
  }
  return out;
}

/**
 * Run the sandbox. `preferHigherGrade` must be the student's real reservist
 * setting so the simulation obeys the same retake rule as their actual record.
 */
export function simulate(
  courses: UserCourseWithCourse[],
  overrides: OverrideMap,
  opts?: { preferHigherGrade?: boolean },
): SimulationResult {
  const current = calculateGrades(courses, opts);
  const simulated = calculateGrades(applyOverrides(courses, overrides), opts);
  const averageDelta =
    current.courseAverage != null && simulated.courseAverage != null
      ? Math.round((simulated.courseAverage - current.courseAverage) * 100) / 100
      : null;

  let changedCount = 0;
  let excludedCount = 0;
  for (const uc of courses) {
    const o = overrides[uc.id];
    if (!o) continue;
    if (o.included === false) { excludedCount++; changedCount++; continue; }
    const gradeChanged = o.grade !== undefined && o.grade !== uc.grade;
    const binaryChanged = o.isBinary !== undefined && o.isBinary !== uc.isBinary;
    if (gradeChanged || binaryChanged) changedCount++;
  }

  return { current, simulated, averageDelta, changedCount, excludedCount };
}

/**
 * The מועד ב׳ question, answered directly: what would this course's grade have
 * to be for the overall average to reach `targetAverage`?
 *
 * Returns null when it cannot be reached with any legal grade (0-100) — which
 * is itself the answer, and a far more useful one than a number that implies
 * a 104 would do it.
 */
export function gradeNeededForTarget(
  courses: UserCourseWithCourse[],
  courseId: string,
  targetAverage: number,
  opts?: { preferHigherGrade?: boolean },
): number | null {
  const target = courses.find((c) => c.id === courseId);
  if (!target) return null;
  // Binary search over the legal grade range: the average is monotonic in this
  // course's grade, so this converges and needs no algebra that could drift
  // away from what calculateGrades actually does.
  let lo = GRADE_MIN;
  let hi = GRADE_MAX;
  const averageWith = (g: number) =>
    calculateGrades(applyOverrides(courses, { [courseId]: { grade: g } }), opts).courseAverage;

  if ((averageWith(GRADE_MAX) ?? -Infinity) < targetAverage) return null; // unreachable
  if ((averageWith(GRADE_MIN) ?? Infinity) >= targetAverage) return GRADE_MIN; // already there

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if ((averageWith(mid) ?? -Infinity) >= targetAverage) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Counts per 10-point band, for the distribution bar. */
export function gradeDistribution(
  courses: UserCourseWithCourse[],
  opts?: { preferHigherGrade?: boolean },
): { band: string; from: number; count: number }[] {
  const graded = canonicalAttempts(courses.filter(countsTowardAverage), opts);
  const bands = [
    { band: "<60", from: 0 },
    { band: "60–69", from: 60 },
    { band: "70–79", from: 70 },
    { band: "80–89", from: 80 },
    { band: "90+", from: 90 },
  ];
  return bands.map((b, i) => {
    const next = bands[i + 1]?.from ?? Infinity;
    return {
      ...b,
      count: graded.filter((uc) => (uc.grade ?? -1) >= b.from && (uc.grade ?? -1) < next).length,
    };
  });
}
