// =========================================================================
// השושלת (the lineage) — the shape of the cross-cohort knowledge flow.
// =========================================================================
// #41 asked for one concept covering תיק המחזור + חונכות + "מחזורים קודמים
// והבאים", aimed at "דורות עתידיים". Concretely that means a student should be
// able to see WHERE THEY SIT in the chain: how many cohorts left something
// behind for them, whether their own cohort is represented, and who comes
// after.
//
// PRIVACY: this counts DISTINCT cohort YEARS over content that already renders
// its own year on screen (insight cards, gallery rows — see cohort-label.ts).
// It adds no new field, no identity, and no per-year counts — a per-year count
// would point straight at a lone contributor, which is exactly what
// safeCohortYear() exists to prevent. Distinct-year presence is strictly less
// information than what is already painted.

export interface GenerationSpan {
  /** Distinct cohorts that started BEFORE me and left something in the file. */
  before: number;
  /** 1 when my own cohort is represented here, 0 otherwise. */
  mine: number;
  /** Distinct cohorts that started AFTER me and are already contributing. */
  after: number;
  /** Distinct cohorts represented in total (including mine). */
  total: number;
  /** The earliest cohort year present, or null when the file is empty. */
  earliest: number | null;
}

const EMPTY: GenerationSpan = { before: 0, mine: 0, after: 0, total: 0, earliest: null };

/**
 * Where the caller sits in the chain of cohorts that contributed.
 *
 * `myStartYear` unknown (a student who never filled in their start year) is
 * handled honestly: we still report `total` and `earliest`, but refuse to
 * claim anything is "before" or "after" them — we simply don't know.
 */
export function generationSpan(
  cohortYears: readonly (number | null | undefined)[],
  myStartYear: number | null | undefined,
): GenerationSpan {
  const years = [...new Set(cohortYears.filter((y): y is number => typeof y === "number" && Number.isFinite(y)))];
  if (years.length === 0) return EMPTY;

  const earliest = Math.min(...years);
  if (myStartYear == null) {
    return { before: 0, mine: 0, after: 0, total: years.length, earliest };
  }

  let before = 0;
  let mine = 0;
  let after = 0;
  for (const y of years) {
    if (y < myStartYear) before++;
    else if (y === myStartYear) mine = 1;
    else after++;
  }
  return { before, mine, after, total: years.length, earliest };
}

/**
 * Does the student have anything of their own in the lineage yet? Pure counting
 * over the stats the cohort router already returns — used to pick between the
 * "you're a reader" and "you're a contributor" framing, never to gate access.
 */
export function hasContributed(stats: {
  reviews?: number;
  insights?: number;
  plans?: number;
} | null | undefined): boolean {
  if (!stats) return false;
  return (stats.reviews ?? 0) + (stats.insights ?? 0) + (stats.plans ?? 0) > 0;
}
