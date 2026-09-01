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
 * Free-text tips appear only from this many reviewers.
 *
 * Added 13.8 after an audit found `getForCourse` returning the `reviews` array
 * — the actual prose people write — at N=1, to anonymous unauthenticated
 * visitors, while every sibling field on the same response was gated. With ~24
 * students in the programme, a niche course with one reviewer means that tip
 * belongs to the one person everyone knows took it. The payload carries no
 * name, but the cohort does the de-anonymising.
 *
 * Set equal to RATING_MIN_N rather than lower: prose is at least as
 * identifying as a number — phrasing, specifics and grievances all point at a
 * person — so it must never reveal on a weaker bar than a workload score.
 */
export const TIP_MIN_N = RATING_MIN_N;

/**
 * A cohort YEAR may be attached to a piece of content only when that cohort
 * has at least this many rows of the same kind. Below it the label stops being
 * context ("מחזור 2023") and starts being a pointer at one identifiable person.
 */
export const COHORT_LABEL_MIN_N = 5;

/**
 * ORDER STATISTICS need a higher bar than an average, because they are not
 * aggregates at all.
 *
 * `percentile()` returns a raw array element — it does not interpolate. At
 * GRADE_MIN_N = 5 the indices land on 1, 2 and 3 of 5, so "median", "p25" and
 * "p75" were the 2nd, 3rd and 4th contributors' VERBATIM grades, published
 * together with the mean on a public (unauthenticated) procedure. Three real
 * rows, plus a figure that lets a reader solve for the sum of the other two.
 *
 * The rest of this file reasons carefully about prose and cohort labels and
 * never distinguished an order statistic from an aggregate — so an average and
 * a median were treated as the same kind of claim. They are not: a mean of five
 * numbers is nobody's grade, and a median of five numbers is exactly one
 * person's.
 *
 * Double the grade bar, so a quantile sits several rows away from any endpoint
 * and no single index is recoverable. Quantiles are ALSO bucketed to the
 * nearest 5 (see `bucketGrade`) so that even above this bar the published value
 * is a band and not a lookup.
 */
export const QUANTILE_MIN_N = GRADE_MIN_N * 2;

/**
 * Round a published quantile to the nearest 5, so it names a band rather than a
 * person. 81 → 80, 88 → 90. The average is NOT bucketed — it is a genuine
 * aggregate and its precision is what makes it useful.
 */
export function bucketGrade(value: number | null): number | null {
  return value == null ? null : Math.round(value / 5) * 5;
}

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
