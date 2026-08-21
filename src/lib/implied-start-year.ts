// =========================================================================
// When the grades contradict the declared year, believe the grades
// =========================================================================
// Ariel, 21.8: "הוא לא הצליח לקלוט את ה-3010 שלי משום מה".
//
// The 3010 import had in fact read his form correctly. What it then said was
// "כל השירות שבטופס קדם לתחילת התואר שלכם — אין מה לייבא", and that was wrong
// for a reason nobody would guess from the message: in onboarding he had
// picked "שנה א׳", so the app anchored his degree at the year being planned
// (2026) — while the very same onboarding was importing his grade sheet, whose
// rows are stamped 2025/1 and 2025/2. Service from January–May 2026 sits INSIDE
// a degree that began in 2025 and outside one that begins in 2026, so all of it
// was filed as "before you were a student".
//
// A student who has grades from an academic year did not begin their degree
// after it. That is not an inference about intent, it is arithmetic on evidence
// the app is holding in the same screen. So this module reads the earliest
// academic year stamped on the scanned sheet and reports what it implies.
//
// It deliberately only ever moves the anchor EARLIER. A grade sheet proves that
// a degree had started by a given year; it can never prove one started later
// than declared (a transfer student, someone resuming after a break, or a
// mis-scan would all look like that), so a later implication is ignored.
//
// Nothing here writes anything. The caller asks the student to confirm — the
// declared year is theirs to state, and silently rewriting it would be the same
// class of mistake as silently ignoring it.

/** Academic-year key: 2025 means תשפ"ו, the year that begins in autumn 2025. */
export type AcademicYearKey = number;

/**
 * Pull the academic year out of a TAU sheet's semester stamp.
 *
 * The sheet prints `2025/1` (autumn of 2025/26) and `2025/2` (that spring).
 * Both belong to academic year 2025 — the number before the slash is already
 * the academic-year key, which is why the semester digit is irrelevant here.
 */
export function academicYearOfSheetSemester(stamp: string | null | undefined): AcademicYearKey | null {
  if (!stamp) return null;
  const m = stamp.trim().match(/^(\d{4})\s*\/\s*([123])$/);
  if (!m) return null;
  const year = Number(m[1]);
  // A degree anchor outside this range is a misparse, not a student.
  if (year < 2000 || year > 2100) return null;
  return year;
}

export interface ImpliedStartYear {
  /** The earliest academic year the sheet shows work in. */
  earliestAcademicYear: AcademicYearKey;
  /** What the app currently believes, for the caller to compare against. */
  declaredStartYear: AcademicYearKey;
  /** How many years earlier the evidence sits. Always ≥ 1 when present. */
  yearsEarlier: number;
}

/**
 * Compare a declared start year against the scanned sheet, and report a
 * contradiction when there is one.
 *
 * Returns null when the sheet has no usable stamps, or when it agrees with —
 * or postdates — the declaration. Only an EARLIER year is reported, for the
 * reason in the header comment.
 */
export function impliedStartYear(
  sheetSemesters: readonly (string | null | undefined)[],
  declaredStartYear: AcademicYearKey | null | undefined,
): ImpliedStartYear | null {
  if (declaredStartYear == null) return null;

  const years = sheetSemesters
    .map(academicYearOfSheetSemester)
    .filter((y): y is AcademicYearKey => y != null);
  if (years.length === 0) return null;

  const earliest = Math.min(...years);
  if (earliest >= declaredStartYear) return null;

  return {
    earliestAcademicYear: earliest,
    declaredStartYear,
    yearsEarlier: declaredStartYear - earliest,
  };
}

/**
 * The year-of-study the evidence implies, for showing the student what
 * accepting the correction would mean ("that would make you year 2").
 *
 * PPE is a three-year degree, so this clamps to 1..3 the same way the rest of
 * the app does — a longer gap means something unusual that a student should
 * resolve in settings rather than have guessed at here.
 */
export function yearOfStudyFor(
  startYear: AcademicYearKey,
  planningAnchorYear: AcademicYearKey,
): number {
  return Math.min(3, Math.max(1, planningAnchorYear - startYear + 1));
}
