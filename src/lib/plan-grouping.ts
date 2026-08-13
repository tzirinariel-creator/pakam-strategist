/**
 * Grouping a plan by semester — client-side.
 *
 * PERF (#31). `plan.getUserPlan` used to return BOTH `courses` and a
 * `semesters` map holding the very same rows a second time. Measured on a
 * 32-course account that was 44 KB of duplicated rows (plus the superjson
 * Date-metadata paths for every duplicated field) inside a 106 KB response —
 * on the app's hottest query, refetched after every single grade save.
 *
 * Exactly one screen ever read the map (the calendar). Grouping is a linear
 * pass, so it belongs on the client. Pure + generic so it can be unit-tested
 * without Prisma types.
 */

/** The only two fields grouping needs — anything plan-shaped satisfies this. */
export interface SemesterPlaced {
  plannedYear: number;
  plannedSemester: string;
}

/** `"2-SPRING"` — the same key shape the server used to emit, so callers
 *  (and any stored UI state keyed on it) keep working unchanged. */
export function semesterKey(uc: SemesterPlaced): string {
  return `${uc.plannedYear}-${uc.plannedSemester}`;
}

/**
 * Group plan rows into `{ "1-FALL": [...], "1-SPRING": [...] }`.
 * Insertion order of each bucket follows the input order (the server already
 * sorts by plannedYear, then plannedSemester).
 */
export function groupCoursesBySemester<T extends SemesterPlaced>(
  courses: readonly T[] | undefined | null,
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const uc of courses ?? []) {
    (grouped[semesterKey(uc)] ??= []).push(uc);
  }
  return grouped;
}
