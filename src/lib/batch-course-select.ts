// =========================================
// Batch course selection — the bidding-week add flow
// =========================================
// Today a student adds courses ONE AT A TIME. That is the wrong shape for the
// week that matters: before the מכרז opens (7.9.2026) you sit down once and
// place a whole semester. bid-it already does filter → multi-select → "add them
// all" (docs/מחקר-מתחרים-מערכת-שעות.md §2), and that is the part of their flow
// worth copying.
//
// What neither competitor can copy back is the ANNOTATION. We hold the
// student's degree state, so the picker can say which course closes a
// requirement that is still open, which mandatory course is not yet anywhere in
// the plan, and which one feeds the focus area. bid-it can only offer a faculty
// tree; we can offer "these four are the ones you are actually missing".
//
// This file is the pure part: no React, no tRPC, no i18n. The modal renders it.
//
// ── What is deliberately NOT here ────────────────────────────────────
// Nothing about bidding POINTS. TAU's quota is unpublished and the official
// guidance forbids extrapolating from previous years, so requirement-fit, hour
// counts and clash detection are the only claims this picker makes.
// (CLAUDE.md iron rule; competitor study §7.)

/** A catalog course, reduced to the fields the picker reasons about. */
export interface BatchCourse {
  id: string;
  code: string;
  discipline: string;
  /** Alternative discipline attributions from the ידיעון (`canCountAs`). */
  canCountAs?: string[];
  courseType: string;
  credits: number;
  isMandatory: boolean;
  /** Empty means "offered in every semester" — that is how the catalog encodes it. */
  semesterOffered: string[];
  prerequisites: string[];
}

/**
 * What the degree still needs. Every gap is what remains AFTER everything
 * already in the plan is counted — a course the student planned last week must
 * not still be advertised as "closes philosophy".
 */
export interface DegreeState {
  focusArea: string | null;
  /** discipline id → ש״ס still missing (entries at 0 or below are ignored) */
  disciplineGaps: Record<string, number>;
  /** ש״ס still missing from the seminar bucket */
  seminarGap: number;
  /** English courses still missing */
  englishGap: number;
  /** Course ids already placed ANYWHERE in the plan (any year, any semester). */
  plannedCourseIds: ReadonlySet<string>;
}

export interface RequirementFit {
  kind: "discipline" | "seminar" | "english";
  /** Set only for kind === "discipline". */
  discipline?: string;
  /** How much is still missing BEFORE this course is added (ש״ס, or courses for English). */
  remaining: number;
}

export interface CourseFit {
  alreadyPlanned: boolean;
  offeredInTarget: boolean;
  isMandatoryUnplanned: boolean;
  isFocusArea: boolean;
  /** null when the course closes nothing that is still open. */
  closes: RequirementFit | null;
  hasConflict: boolean;
  /**
   * Prerequisite codes not present in the plan. ADVISORY ONLY — PPE students
   * are formally exempt from prerequisites (Yedion note 19), so this never
   * blocks selection. Mirrors `canTakeCourse`'s `prereqAdvisory`.
   */
  missingPrereqs: string[];
  /** Can be checked. False only for a course already in this plan. */
  selectable: boolean;
  /** Sort weight, higher first. */
  rank: number;
}

export type BatchFilterId = "all" | "needed" | "mandatory" | "focus" | "clear";

export const BATCH_FILTERS: readonly BatchFilterId[] = [
  "all",
  "needed",
  "mandatory",
  "focus",
  "clear",
] as const;

/** Every discipline this course may legally be counted toward. */
function candidateDisciplines(course: BatchCourse): string[] {
  return Array.from(new Set([course.discipline, ...(course.canCountAs ?? [])]));
}

/**
 * Does this course close something still open? Picks the discipline with the
 * LARGEST open gap among the ones the course may count toward, because that is
 * the one the student is furthest from and the most useful thing to say.
 *
 * Seminar and English are separate buckets in the regulations, so they are
 * checked in their own right — a seminar course that also fills a discipline
 * gap reports the discipline (the more specific, more actionable fact).
 */
export function requirementFit(
  course: BatchCourse,
  state: DegreeState
): RequirementFit | null {
  let best: RequirementFit | null = null;
  for (const d of candidateDisciplines(course)) {
    const gap = state.disciplineGaps[d] ?? 0;
    if (gap > 0 && (best == null || gap > best.remaining)) {
      best = { kind: "discipline", discipline: d, remaining: gap };
    }
  }
  if (best) return best;

  if (course.courseType === "SEMINAR" && state.seminarGap > 0) {
    return { kind: "seminar", remaining: state.seminarGap };
  }
  if (course.courseType === "ENGLISH" && state.englishGap > 0) {
    return { kind: "english", remaining: state.englishGap };
  }
  return null;
}

/**
 * Is the course taught in the semester we are adding to?
 *
 * An EMPTY `semesterOffered` means the catalog does not say, and the honest
 * answer there is "yes, as far as we know" — hiding a course because a scraped
 * field is blank would silently shrink the catalog during bidding week.
 */
export function offeredIn(course: BatchCourse, targetSemester: string): boolean {
  if (course.semesterOffered.length === 0) return true;
  return course.semesterOffered.includes(targetSemester);
}

export function courseFit(
  course: BatchCourse,
  state: DegreeState,
  opts: {
    targetSemester: string;
    hasConflict: boolean;
    /** Course CODES already in the plan — used for the advisory prereq note. */
    plannedCourseCodes: ReadonlySet<string>;
  }
): CourseFit {
  const alreadyPlanned = state.plannedCourseIds.has(course.id);
  const offeredInTarget = offeredIn(course, opts.targetSemester);
  const closes = alreadyPlanned ? null : requirementFit(course, state);
  const isMandatoryUnplanned = course.isMandatory && !alreadyPlanned;
  const isFocusArea =
    state.focusArea != null &&
    candidateDisciplines(course).includes(state.focusArea);
  const missingPrereqs = course.prerequisites.filter(
    (code) => !opts.plannedCourseCodes.has(code)
  );

  // Ranking. The bidding-week question is "what should I be looking at", so a
  // mandatory course missing from the whole plan outranks a nice-to-have, and
  // anything that clashes with what is already scheduled sinks — it is still
  // listed (the student may want to move the other course), just not first.
  let rank = 0;
  if (isMandatoryUnplanned) rank += 8;
  if (closes) rank += 4;
  if (isFocusArea) rank += 2;
  if (opts.hasConflict) rank -= 3;
  if (!offeredInTarget) rank -= 20;
  if (alreadyPlanned) rank -= 40;

  return {
    alreadyPlanned,
    offeredInTarget,
    isMandatoryUnplanned,
    isFocusArea,
    closes,
    hasConflict: opts.hasConflict,
    missingPrereqs,
    // Only a duplicate is unselectable. An unmet prerequisite must NEVER block
    // (PPE exemption), and neither must a clash — telling a student they may
    // not even consider a course because it overlaps is how you make a planner
    // that plans worse than paper.
    selectable: !alreadyPlanned,
    rank,
  };
}

export function matchesFilter(fit: CourseFit, filter: BatchFilterId): boolean {
  switch (filter) {
    case "needed":
      return fit.closes != null;
    case "mandatory":
      return fit.isMandatoryUnplanned;
    case "focus":
      return fit.isFocusArea;
    case "clear":
      return !fit.hasConflict && fit.offeredInTarget;
    case "all":
    default:
      return true;
  }
}

export interface AnnotatedCourse {
  course: BatchCourse;
  fit: CourseFit;
}

/**
 * Order for display: best fit first, already-planned last, then a stable
 * alphabetical tie-break by code so the list never reshuffles between renders.
 */
export function compareAnnotated(a: AnnotatedCourse, b: AnnotatedCourse): number {
  if (a.fit.rank !== b.fit.rank) return b.fit.rank - a.fit.rank;
  return a.course.code.localeCompare(b.course.code);
}

export function annotateAll(
  courses: readonly BatchCourse[],
  state: DegreeState,
  opts: {
    targetSemester: string;
    conflictCourseIds: ReadonlySet<string>;
    plannedCourseCodes: ReadonlySet<string>;
  }
): AnnotatedCourse[] {
  return courses
    .map((course) => ({
      course,
      fit: courseFit(course, state, {
        targetSemester: opts.targetSemester,
        hasConflict: opts.conflictCourseIds.has(course.id),
        plannedCourseCodes: opts.plannedCourseCodes,
      }),
    }))
    .sort(compareAnnotated);
}

/** How many of each filter would show — drives the counts on the filter chips. */
export function filterCounts(
  annotated: readonly AnnotatedCourse[]
): Record<BatchFilterId, number> {
  const counts = {} as Record<BatchFilterId, number>;
  for (const id of BATCH_FILTERS) {
    counts[id] = annotated.filter((a) => matchesFilter(a.fit, id)).length;
  }
  return counts;
}

export interface SelectionSummary {
  count: number;
  credits: number;
  /** How many of the selected courses clash with the existing schedule. */
  conflicts: number;
  /** How many of them close a still-open requirement. */
  closesRequirements: number;
}

/**
 * The running total under the list. Credits are summed as ש״ס so the student
 * sees the semester load grow as they tick — the counter both competitors put
 * at the top of the screen, except ours also says what the batch is FOR.
 *
 * Takes the SELECTED courses themselves, not ids into the visible list. A
 * selection has to survive the student typing a new search: the visible list is
 * refetched and briefly empty, and a summary computed by looking ids up in it
 * would blink to zero and then silently drop the batch. (Caught live, 13.8 —
 * ticking three courses and then typing in the search box cleared them.)
 */
export function summarizeSelection(
  selected: readonly AnnotatedCourse[]
): SelectionSummary {
  let count = 0;
  let credits = 0;
  let conflicts = 0;
  let closesRequirements = 0;
  const seen = new Set<string>();
  for (const { course, fit } of selected) {
    if (seen.has(course.id)) continue;
    seen.add(course.id);
    count += 1;
    credits += course.credits;
    if (fit.hasConflict) conflicts += 1;
    if (fit.closes) closesRequirements += 1;
  }
  // Credits are halves in the catalog (2.5, 3.5); float addition drifts.
  return { count, credits: Math.round(credits * 100) / 100, conflicts, closesRequirements };
}

export interface BatchAddItem {
  courseId: string;
  plannedYear: number;
  plannedSemester: string;
}

/**
 * Turn a selection into the exact sequence of `plan.addCourse` calls to make.
 *
 * Deliberately built on the EXISTING single-course mutation rather than a new
 * bulk endpoint: that procedure already runs its duplicate check inside a
 * transaction, already assigns the attempt number, and is already covered by
 * tests. A second write path for the same fact is how the two drift apart.
 *
 * Duplicates are dropped here as well as server-side — a student who ticks a
 * course, and whose plan is refetched mid-selection to include it, should not
 * fire a doomed request.
 */
export function buildBatchAddPlan(
  selected: readonly AnnotatedCourse[],
  target: { plannedYear: number; plannedSemester: string }
): BatchAddItem[] {
  const seen = new Set<string>();
  const items: BatchAddItem[] = [];
  for (const { course, fit } of selected) {
    if (fit.alreadyPlanned) continue;
    if (seen.has(course.id)) continue;
    seen.add(course.id);
    items.push({
      courseId: course.id,
      plannedYear: target.plannedYear,
      plannedSemester: target.plannedSemester,
    });
  }
  return items;
}

/**
 * Reconcile a selection against a freshly annotated list.
 *
 * Two jobs. (1) REFRESH: an entry that appears in `refreshed` takes the new
 * annotation, so a clash that only exists once the target semester's schedule
 * has loaded shows up in the running total. (2) DROP: an entry that is now
 * unselectable — added in another tab, or by the batch itself — falls out
 * instead of sitting there ticked and un-addable.
 *
 * An entry MISSING from `refreshed` is kept as-is. That is the whole point:
 * the visible list is filtered by the search box and refetched as the student
 * types, and "not currently on screen" must never mean "deselected".
 */
export function pruneSelection(
  selected: readonly AnnotatedCourse[],
  refreshed: readonly AnnotatedCourse[]
): AnnotatedCourse[] {
  const byId = new Map(refreshed.map((a) => [a.course.id, a]));
  const out: AnnotatedCourse[] = [];
  const seen = new Set<string>();
  for (const entry of selected) {
    if (seen.has(entry.course.id)) continue;
    seen.add(entry.course.id);
    const current = byId.get(entry.course.id);
    if (current == null) {
      out.push(entry);
      continue;
    }
    if (!current.fit.selectable) continue;
    out.push(current);
  }
  return out;
}

/**
 * Build the degree state from the credit breakdown the rest of the app already
 * computes. `disciplineStatus` comes straight from `plan.getCredits`, whose
 * `earned` field is really earned+planned (every countable status) — which is
 * exactly right here: the gap must be what is left after the current plan.
 */
export function buildDegreeState(input: {
  disciplineStatus: readonly { discipline: string; earned: number; required: number }[];
  seminarEarned: number;
  seminarRequired: number;
  englishCoursesEarned: number;
  englishCoursesRequired: number;
  focusArea: string | null;
  plannedCourseIds: Iterable<string>;
}): DegreeState {
  const disciplineGaps: Record<string, number> = {};
  for (const d of input.disciplineStatus) {
    const gap = Math.round((d.required - d.earned) * 100) / 100;
    if (gap > 0) disciplineGaps[d.discipline] = gap;
  }
  return {
    focusArea: input.focusArea,
    disciplineGaps,
    seminarGap: Math.max(0, Math.round((input.seminarRequired - input.seminarEarned) * 100) / 100),
    englishGap: Math.max(0, input.englishCoursesRequired - input.englishCoursesEarned),
    plannedCourseIds: new Set(input.plannedCourseIds),
  };
}
