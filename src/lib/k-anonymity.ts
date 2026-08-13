// =========================================================================
// k-anonymity — the single source of truth for every reveal threshold in the
// social layer ("השושלת").
// =========================================================================
// These numbers are the reason the cohort data is worth reading at all: people
// write an honest review of a course only when no reader can work out who
// wrote it. Weakening a threshold does not "show more data" — it silently
// turns the archive into a place nobody contributes to.
//
// They used to live as module-private constants inside two routers, which made
// "never weaken k-anonymity" a grep instead of a rule. Centralised here and
// pinned by src/lib/__tests__/k-anonymity.test.ts, so any change to a number
// has to walk past a failing test with the reasoning written next to it.

/** A course grade average appears only from this many grade contributors. */
export const GRADE_MIN_N = 5;

/** Workload / difficulty / recommend-share appear only from this many raters. */
export const RATING_MIN_N = 3;

/**
 * A cohort YEAR may be attached to a piece of content only when that cohort
 * has at least this many rows of the same kind. Below it the label stops being
 * context ("מחזור 2023") and starts being a pointer at one identifiable person.
 */
export const COHORT_LABEL_MIN_N = 5;

/** Distinct reporters that auto-hide content pending admin review. */
export const REPORT_HIDE_THRESHOLD = 3;

/** Count rows per cohort year, ignoring rows with no year. */
export function countByCohortYear(
  rows: readonly { cohortYear?: number | null }[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.cohortYear == null) continue;
    counts.set(row.cohortYear, (counts.get(row.cohortYear) ?? 0) + 1);
  }
  return counts;
}

/**
 * The cohort year of a single row, but ONLY when that cohort is crowded enough
 * to hide the individual inside it. Returns null otherwise — the caller then
 * renders the content with no year, never a guess and never a narrower label.
 */
export function safeCohortYear(
  cohortYear: number | null | undefined,
  countsByYear: ReadonlyMap<number, number>,
  minN: number = COHORT_LABEL_MIN_N,
): number | null {
  if (cohortYear == null) return null;
  return (countsByYear.get(cohortYear) ?? 0) >= minN ? cohortYear : null;
}
