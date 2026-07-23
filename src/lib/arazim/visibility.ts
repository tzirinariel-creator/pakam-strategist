// =========================================================================
// Arazim visibility gate — the single ON/OFF switch for the external
// arazim-project.com grade data (historical averages, fail-rates, difficulty).
// =========================================================================
// Owner decision (Ariel, 23.7): "בלי ארזים כרגע" — remove ALL Arazim data,
// both the numbers shown to the user (catalog / course card / the King) AND the
// invisible difficulty signal that fed the exam-planner's study-hour weighting
// and the plan-generator's balancing. Ariel dislikes averages that don't come
// from the app's OWN real database; every consumer already degrades gracefully
// to a neutral / "אין נתוני עבר" state when these fields are null.
//
// This is a FLAG, not a data deletion: the DB rows keep their Arazim values, so
// flipping ARAZIM_ENABLED back to `true` restores the feature instantly with no
// re-sync. That is exactly what "כרגע" (for now) calls for. The cron + admin
// sync writers are also short-circuited while this is false so no NEW Arazim
// data lands (see api/cron/sync-arazim + routers/admin).
//
// Because Arazim is the ONLY writer of these Course columns, gating on the
// source string makes the removal total today while staying correct if a
// different (e.g. real-cohort) source ever populates them.

/** Master switch. `false` = Arazim data is hidden everywhere and no new syncs run. */
export const ARAZIM_ENABLED = false;

/** The Course grade columns that Arazim populates. */
export interface ArazimGradeFields {
  averageGrade: number | null;
  medianGrade: number | null;
  gradeStdDev: number | null;
  failRate: number | null;
  difficultyLevel: string | null;
  gradeDataYear: string | null;
  gradeDataSource: string | null;
}

const HIDDEN: Omit<ArazimGradeFields, "gradeDataSource"> = {
  averageGrade: null,
  medianGrade: null,
  gradeStdDev: null,
  failRate: null,
  difficultyLevel: null,
  gradeDataYear: null,
};

/**
 * True when this course's grade columns are Arazim-sourced AND Arazim is on.
 * Tolerant of a missing `gradeDataSource` (some queries don't select it): when
 * Arazim is off the source is irrelevant (always hidden); when on, an absent
 * source can't be Arazim, so it stays hidden — the safe default either way.
 */
export function arazimVisible(course: { gradeDataSource?: string | null }): boolean {
  return ARAZIM_ENABLED && course.gradeDataSource === "arazim";
}

/**
 * The single seam every reader must go through. Returns the course's Arazim
 * grade fields when Arazim is visible, or all-null when it's off (or the data
 * isn't Arazim-sourced). Consumers then hit their existing null-handling paths.
 * Accepts a partial course shape so every call site can pass its own type.
 */
export function arazimView(
  course: Partial<ArazimGradeFields>,
): Omit<ArazimGradeFields, "gradeDataSource"> {
  if (!arazimVisible(course)) return HIDDEN;
  return {
    averageGrade: course.averageGrade ?? null,
    medianGrade: course.medianGrade ?? null,
    gradeStdDev: course.gradeStdDev ?? null,
    failRate: course.failRate ?? null,
    difficultyLevel: course.difficultyLevel ?? null,
    gradeDataYear: course.gradeDataYear ?? null,
  };
}
