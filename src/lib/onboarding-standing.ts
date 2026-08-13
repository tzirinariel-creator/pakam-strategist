// =========================================================================
// Onboarding standing — what a grade sheet says about where a student stands
// =========================================================================
// #11 + #26. The old onboarding assumed a BRAND-NEW student: it walked every
// registrant through "build your year-1 semester-א׳ timetable", which is
// nonsense for the majority who are mid-degree ("מה אחי? זה קורסים שכבר
// עשיתי"). The fix is to ask ONE question first — "do you already have
// credits?" — and, for a returning student, read their official grade sheet
// before asking them to type anything.
//
// This module is the pure half of that: rows the vision scanner READ off the
// sheet → a factual picture of the student's standing. It is deliberately
// conservative:
//   · It never invents a course, a grade or a semester. Every number here is
//     either printed on the sheet or counted from the course catalog.
//   · A row the scanner flagged `uncertain` (the two vision reads disagreed)
//     is carried through as uncertain, never silently trusted.
//   · A failed / exempt / still-in-progress row is NEVER counted as completed.
//   · When the sheet gives no basis for a conclusion, the conclusion is null —
//     the UI then asks the student instead of guessing.
// Nothing here writes. The student confirms in the history step, and the save
// still happens once, at the end, through the existing step-ready path.

import type { ExtractedRow } from "./grade-sheet";
import { mapSheetSemesters, normalizeName } from "./grade-sheet";
import { passBarFor } from "./constants";

/** The bits of a catalog course this module needs. Structural on purpose, so
 *  tests don't have to build whole Prisma rows. */
export interface StandingCatalogCourse {
  code: string;
  nameHe: string;
  credits: number;
  courseType?: string | null;
  isMandatory?: boolean | null;
  discipline?: string | null;
  canCountAs?: string[] | null;
}

export type StandingStatus =
  | "COMPLETED"
  | "FAILED"
  | "EXEMPT"
  | "IN_PROGRESS"
  | "UNREADABLE";

export interface StandingRow {
  /** Catalog code when matched; otherwise the code printed on the sheet, or a
   *  `CUSTOM-…` key for a row that has a name but no usable code. */
  key: string;
  /** Catalog name when matched (authoritative), else the name off the sheet. */
  name: string;
  credits: number | null;
  grade: number | null;
  status: StandingStatus;
  /** Matched a course in the PPE catalog. */
  inCatalog: boolean;
  isMandatory: boolean;
  discipline: string | null;
  /** The two vision reads disagreed on this row — must be shown for review. */
  uncertain: boolean;
  /** Study-year / semester derived from the SHEET'S OWN semester headers. Null
   *  when the sheet printed no header for this row. */
  plannedYear: number | null;
  plannedSemester: "FALL" | "SPRING" | "SUMMER" | null;
  /** The raw header text off the sheet ("2025/1"), for honest display. */
  sheetSemester: string | null;
}

export interface StandingPlacement {
  year: number;
  semester: "FALL" | "SPRING";
  /**
   * Why we concluded this — the UI must say it out loud, because the student is
   * about to have their whole plan seeded from it:
   * · "sheet"     — read off the sheet's own semester headers (strongest)
   * · "credits"   — no headers on the sheet; inferred from credits earned
   * · "gap"       — headers exist, but the next teaching semester doesn't
   *                 directly follow the last one on the sheet (a skipped or
   *                 unrecorded semester). Same suggestion, lower confidence.
   */
  basis: "sheet" | "credits" | "gap";
  /** The last semester header printed on the sheet, verbatim. Null for basis
   *  "credits". Shown so the student can check it against their own sheet. */
  lastSheetSemester: string | null;
}

export interface StandingSummary {
  rows: StandingRow[];
  completed: StandingRow[];
  failed: StandingRow[];
  exempt: StandingRow[];
  inProgress: StandingRow[];
  /** Rows the scanner flagged as uncertain (any status). */
  uncertain: StandingRow[];
  /** Credits from COMPLETED rows only. Exempt/failed/in-progress excluded. */
  creditsEarned: number;
  /** Completed credits per discipline, counting `canCountAs` alternatives too,
   *  so the UI can show which focus area the student is already closest to. */
  creditsByDiscipline: Record<string, number>;
  /** Mandatory catalog courses completed / total mandatory in the catalog. */
  mandatoryDone: number;
  mandatoryTotal: number;
  /** Completed credits that are NOT mandatory catalog courses (electives, both
   *  in-catalog and off-catalog). */
  electiveCredits: number;
  /** Completed rows that matched no catalog course — real electives taken
   *  outside the PPE list. Counted, never dropped. */
  offCatalogCompleted: number;
  /** Distinct FALL/SPRING semester blocks printed on the sheet. */
  semestersOnSheet: number;
  /** Suggested (year, semester) to plan next — or null when the sheet gives no
   *  basis at all. NEVER silently applied; the student confirms it. */
  placement: StandingPlacement | null;
}

/** FALL before SPRING within a year. SUMMER is an extra sitting, not a step. */
function semOrder(semester: "FALL" | "SPRING"): number {
  return semester === "FALL" ? 0 : 1;
}

function timelineIndex(year: number, semester: "FALL" | "SPRING"): number {
  return (year - 1) * 2 + semOrder(semester);
}

/**
 * The first (year, semester) that is on `target` AND strictly after `last`.
 * Used so a sheet ending in a FALL block plans the following SPRING, and a
 * sheet ending in SPRING plans the next year's FALL — while still honouring
 * the semester the academic calendar says is actually coming next.
 */
export function nextSemesterOn(
  last: { year: number; semester: "FALL" | "SPRING" },
  target: "FALL" | "SPRING",
  maxYear = 3,
): { year: number; semester: "FALL" | "SPRING" } {
  const lastIdx = timelineIndex(last.year, last.semester);
  const sameYear = timelineIndex(last.year, target);
  const year = sameYear > lastIdx ? last.year : last.year + 1;
  return { year: Math.min(maxYear, Math.max(1, year)), semester: target };
}

/**
 * Study year inferred from credits alone — the fallback when the sheet printed
 * no semester headers we could read. Thresholds come from the published
 * per-year credit ranges in the תשפ״ז ידיעון (year 1 carries 52–60 ש״ס, year 2
 * adds 31–60). They are deliberately loose: this is a SUGGESTION the student
 * confirms, and over-claiming a year is worse than under-claiming it.
 */
export function yearFromCredits(creditsEarned: number): number {
  if (creditsEarned < 40) return 1;
  if (creditsEarned < 85) return 2;
  return 3;
}

/** Decide a row's status from what is printed on the sheet — nothing else. */
function decideStatus(row: ExtractedRow, courseType: string | null): StandingStatus {
  if (row.inProgress) return "IN_PROGRESS";
  const passText = row.passText ?? "";
  if (passText.includes("פטור")) return "EXEMPT";
  if (passText.includes("נכשל")) return "FAILED";
  if (row.grade != null) {
    return row.grade >= passBarFor(courseType ?? undefined) ? "COMPLETED" : "FAILED";
  }
  // "עובר" with no number is a genuine binary pass.
  if (passText.includes("עובר")) return "COMPLETED";
  // No grade, no pass mark, not flagged in-progress: we cannot tell. Say so.
  return "UNREADABLE";
}

/** A stable key for an off-catalog row: its printed code, else its name. */
function offCatalogKey(row: ExtractedRow): string {
  const code = row.courseCode?.trim();
  if (code) return code;
  return `CUSTOM-${normalizeName(row.courseName).replace(/\s+/g, "-").slice(0, 24)}`;
}

export interface SummarizeInput {
  /** Rows as returned by /api/ai/scan-grades (already merged + flagged). */
  rows: (ExtractedRow & { uncertain?: boolean | null })[];
  catalog: StandingCatalogCourse[];
  /** Pre-matched catalog course per row, in the SAME order as `rows` — the
   *  caller uses the shared matchExtractedToCatalog so matching logic isn't
   *  duplicated. `null` for a row that matched nothing. */
  matches: (StandingCatalogCourse | null)[];
  /** The semester the academic calendar says is coming next. Passed in (not
   *  imported) so this module stays pure and testable across dates. */
  upcomingSemester: "FALL" | "SPRING";
  maxYear?: number;
}

/**
 * Turn a scanned sheet into a factual standing picture. Never throws on odd
 * input: an empty/garbled scan produces an empty summary with `placement:
 * null`, which the UI is required to render as "we couldn't read it".
 */
export function summarizeStanding({
  rows,
  catalog,
  matches,
  upcomingSemester,
  maxYear = 3,
}: SummarizeInput): StandingSummary {
  const semesterMap = mapSheetSemesters(rows);

  const out: StandingRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const course = matches[i] ?? null;
    const placement = row.semester ? (semesterMap.get(row.semester) ?? null) : null;
    const status = decideStatus(row, course?.courseType ?? null);
    out.push({
      key: course ? course.code : offCatalogKey(row),
      // The catalog name is authoritative when we matched — it kills the OCR
      // artefacts (#27/#29) at the source instead of displaying them.
      name: course ? course.nameHe : row.courseName,
      credits: course ? course.credits : (row.credits ?? null),
      grade: row.grade ?? null,
      status,
      inCatalog: Boolean(course),
      isMandatory: Boolean(course && (course.courseType === "MANDATORY" || course.isMandatory)),
      discipline: course?.discipline ?? null,
      uncertain: Boolean(row.uncertain),
      plannedYear: placement ? placement.plannedYear : null,
      plannedSemester: placement ? placement.plannedSemester : null,
      sheetSemester: row.semester ?? null,
    });
  }

  const completed = out.filter((r) => r.status === "COMPLETED");
  const failed = out.filter((r) => r.status === "FAILED");
  const exempt = out.filter((r) => r.status === "EXEMPT");
  const inProgress = out.filter((r) => r.status === "IN_PROGRESS");
  const uncertain = out.filter((r) => r.uncertain);

  const creditsEarned = completed.reduce((s, r) => s + (r.credits ?? 0), 0);

  // Discipline credits: a course counts toward its own discipline AND toward
  // every discipline it may be counted as (the catalog's canCountAs), because
  // that is exactly how the degree rules count it.
  const byCode = new Map(catalog.map((c) => [c.code, c]));
  const creditsByDiscipline: Record<string, number> = {};
  for (const r of completed) {
    if (!r.inCatalog) continue;
    const c = byCode.get(r.key);
    if (!c) continue;
    const targets = new Set<string>();
    if (c.discipline) targets.add(c.discipline);
    for (const d of c.canCountAs ?? []) targets.add(d);
    for (const d of targets) {
      creditsByDiscipline[d] = (creditsByDiscipline[d] ?? 0) + c.credits;
    }
  }

  const mandatoryCatalog = catalog.filter(
    (c) => c.courseType === "MANDATORY" || c.isMandatory,
  );
  const completedCodes = new Set(completed.filter((r) => r.inCatalog).map((r) => r.key));
  const mandatoryDone = mandatoryCatalog.filter((c) => completedCodes.has(c.code)).length;

  const electiveCredits = completed
    .filter((r) => !r.isMandatory)
    .reduce((s, r) => s + (r.credits ?? 0), 0);

  // ── Placement ────────────────────────────────────────────────────────
  // Only FALL/SPRING blocks advance the degree clock; a SUMMER sitting is an
  // extra, not a step, so it never moves the student a semester forward.
  const stepBlocks = out
    .filter((r) => r.plannedYear != null && r.plannedSemester !== null && r.plannedSemester !== "SUMMER")
    .map((r) => ({
      year: r.plannedYear!,
      semester: r.plannedSemester as "FALL" | "SPRING",
      sheetSemester: r.sheetSemester,
    }));
  const distinct = new Map<string, (typeof stepBlocks)[number]>();
  for (const b of stepBlocks) distinct.set(`${b.year}-${b.semester}`, b);
  const blocks = [...distinct.values()].sort(
    (a, b) => timelineIndex(a.year, a.semester) - timelineIndex(b.year, b.semester),
  );

  let placement: StandingPlacement | null = null;
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1]!;
    const natural = nextSemesterOn(last, last.semester === "FALL" ? "SPRING" : "FALL", maxYear);
    const suggested = nextSemesterOn(last, upcomingSemester, maxYear);
    placement = {
      year: suggested.year,
      semester: suggested.semester,
      // The calendar's next teaching semester didn't follow the sheet directly
      // → the student sat out (or the sheet is incomplete). Same suggestion,
      // but the UI must present it as a guess to check, not a fact.
      basis:
        natural.year === suggested.year && natural.semester === suggested.semester
          ? "sheet"
          : "gap",
      lastSheetSemester: last.sheetSemester,
    };
  } else if (completed.length > 0) {
    const year = Math.min(maxYear, yearFromCredits(creditsEarned));
    placement = {
      year,
      semester: upcomingSemester,
      basis: "credits",
      lastSheetSemester: null,
    };
  }

  return {
    rows: out,
    completed,
    failed,
    exempt,
    inProgress,
    uncertain,
    creditsEarned,
    creditsByDiscipline,
    mandatoryDone,
    mandatoryTotal: mandatoryCatalog.length,
    electiveCredits,
    offCatalogCompleted: completed.filter((r) => !r.inCatalog).length,
    semestersOnSheet: blocks.length,
    placement,
  };
}

/**
 * The completed-course seed the onboarding history step consumes, keyed by
 * course code — the SAME shape the manual path builds, so everything
 * downstream (review, edit, save) is unchanged.
 *
 * Only COMPLETED rows are seeded. A failed / exempt / in-progress row is
 * reported to the student but never pre-marked as done: the history map has no
 * FAILED or EXEMPT state, so seeding one would record a false completion and
 * corrupt the average.
 *
 * Rows are clamped into a semester that is genuinely in the past relative to
 * the placement, so a seeded course can always be found (and un-checked) on
 * the review screen.
 */
export function buildCompletedSeed(
  summary: StandingSummary,
  placement: { year: number; semester: "FALL" | "SPRING" },
): Record<
  string,
  {
    courseCode: string;
    plannedYear: number;
    plannedSemester: "FALL" | "SPRING";
    grade: number | null;
    customName?: string;
    credits?: number | null;
  }
> {
  const currentIdx = timelineIndex(placement.year, placement.semester);
  // The latest semester that is strictly in the past — where anything we can't
  // place precisely goes, so it is always visible for review.
  const fallbackIdx = Math.max(0, currentIdx - 1);
  const fallback = {
    year: Math.floor(fallbackIdx / 2) + 1,
    semester: (fallbackIdx % 2 === 0 ? "FALL" : "SPRING") as "FALL" | "SPRING",
  };

  const seed: ReturnType<typeof buildCompletedSeed> = {};
  for (const r of summary.completed) {
    let year = r.plannedYear;
    let semester: "FALL" | "SPRING" | null =
      r.plannedSemester === "SUMMER" ? null : r.plannedSemester;
    if (year == null || semester == null || timelineIndex(year, semester) >= currentIdx) {
      year = fallback.year;
      semester = fallback.semester;
    }
    seed[r.key] = {
      courseCode: r.key,
      plannedYear: year,
      plannedSemester: semester,
      grade: r.grade,
      ...(r.inCatalog ? {} : { customName: r.name, credits: r.credits }),
    };
  }
  return seed;
}
