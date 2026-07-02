// =========================================
// Binary-conversion advisor — pure math
// =========================================
// A miluim student may convert a limited number of graded courses to
// pass/fail ("בינארי"), which REMOVES them from the weighted average. This
// module computes, for each eligible course, what the average would become —
// arithmetic on the student's own grades, nothing predicted or invented.
// Domain rules (מתווה תשפ"ו): quota by group (via lib/miluim), seminars and
// final-track courses cannot be converted, honors needs binaries ≤ 25%.

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

/** Credit-weighted average over graded, non-binary courses. */
export function weightedAverage(courses: GradedCourseLite[]): number | null {
  const pool = courses.filter((c) => !c.isBinary && c.credits > 0);
  const credits = pool.reduce((s, c) => s + c.credits, 0);
  if (credits === 0) return null;
  return pool.reduce((s, c) => s + c.grade * c.credits, 0) / credits;
}

/**
 * Rank the courses whose conversion would RAISE the average, best first.
 * Only genuinely eligible courses: graded, not already binary, not a seminar,
 * and only while the student still has quota. Passing grades only — a failed
 * course (<60) can't be converted to a "pass".
 */
export function rankBinaryCandidates(
  courses: GradedCourseLite[],
  quotaRemaining: number,
): { current: number | null; candidates: BinaryCandidate[] } {
  const current = weightedAverage(courses);
  if (current == null || quotaRemaining <= 0) return { current, candidates: [] };

  const candidates: BinaryCandidate[] = [];
  for (const c of courses) {
    if (c.isBinary || c.credits <= 0) continue;
    if (c.grade < 60) continue; // failed — nothing to convert to a pass
    if ((c.courseType ?? "").toUpperCase().includes("SEMINAR")) continue;
    const rest = courses.filter((x) => x.userCourseId !== c.userCourseId);
    const after = weightedAverage(rest);
    if (after == null) continue;
    const delta = after - current;
    if (delta <= 0) continue; // converting a good grade only hurts
    candidates.push({ course: c, newAverage: after, delta });
  }

  candidates.sort((a, b) => b.delta - a.delta);
  return { current, candidates };
}
