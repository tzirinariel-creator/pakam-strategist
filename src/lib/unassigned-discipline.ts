// =========================================================================
// Courses that count toward nothing — and the ש״ס they are costing you
// =========================================================================
// The degree requires 60 ש״ס inside your focus area. Every catalog course
// carries a discipline so the app can count it — except that 48% of the
// catalog is tagged GENERAL, including 66 of the 68 seminars, even though the
// ידיעון itself says "סמינר בתחום המיקוד בו תוגש עבודה סמינריונית".
//
// The consequence is not cosmetic: with the catalog as it stands the focus-area
// meter CANNOT reach 60. The ceiling is 62, and only if every single elective
// happens to be in-field. A student can do everything right and watch the bar
// stop moving.
//
// The obvious fix was to guess the discipline from the course-code prefix
// (0618 → philosophy, 1031 → political science — the match is near-perfect).
// Ariel's call, and he is right: the STUDENT knows which field their seminar
// was written in, and we would be guessing. `UserCourse.disciplineOverride`
// already exists and is already persisted; what was missing was ever ASKING.
//
// This module decides who to ask about, and what it is costing them — so the
// prompt can state a real number instead of nagging.

/** GENERAL is the catalog's "counts toward no focus area" bucket. */
export const UNASSIGNED_DISCIPLINE = "GENERAL";

export interface AssignableCourse {
  userCourseId: string;
  courseCode: string;
  nameHe: string;
  nameEn?: string | null;
  credits: number;
  /** The catalog's discipline for this course. */
  discipline: string | null;
  /** What the student already told us it counts toward, if anything. */
  disciplineOverride?: string | null;
  status: string;
  /** Seminars are the sharpest case — the ידיעון says they ARE in-field. */
  isSeminar?: boolean;
}

/**
 * The discipline actually used for counting: the student's own answer first,
 * then the catalog. Mirrors what dashboard-content and schedule.ts already do,
 * so a course counts the same everywhere.
 */
export function effectiveDiscipline(c: AssignableCourse): string | null {
  return c.disciplineOverride ?? c.discipline ?? null;
}

/** True when this course counts toward no focus area at all. */
export function isUnassigned(c: AssignableCourse): boolean {
  const d = effectiveDiscipline(c);
  return !d || d === UNASSIGNED_DISCIPLINE;
}

export interface UnassignedSummary {
  /** Courses the student can still resolve, worst-first. */
  courses: AssignableCourse[];
  /** ש״ס currently counting toward no focus area. The number that matters. */
  credits: number;
  /** Of those, the ones already COMPLETED — credits already earned and lost. */
  completedCredits: number;
  /** Seminars among them; called out because the ידיעון is explicit about them. */
  seminarCount: number;
}

/**
 * Everything the student has that counts toward nothing.
 *
 * Sorted by what it costs them: completed before planned (already earned, so
 * the loss is real today), then by credits. A prompt that leads with a 4-ש״ס
 * completed seminar is asking about the right thing first.
 */
export function summarizeUnassigned(courses: AssignableCourse[]): UnassignedSummary {
  const unassigned = courses.filter(isUnassigned);
  const weight = (c: AssignableCourse) => (c.status === "COMPLETED" ? 0 : 1);
  const sorted = [...unassigned].sort(
    (a, b) => weight(a) - weight(b) || b.credits - a.credits || a.courseCode.localeCompare(b.courseCode),
  );
  return {
    courses: sorted,
    credits: unassigned.reduce((sum, c) => sum + c.credits, 0),
    completedCredits: unassigned
      .filter((c) => c.status === "COMPLETED")
      .reduce((sum, c) => sum + c.credits, 0),
    seminarCount: unassigned.filter((c) => c.isSeminar).length,
  };
}
