// =========================================================================
// A course planned in a semester it is not given in
// =========================================================================
// Ariel, 22.8: "אבל בעיקר מטריד אותי אם יש קורסי חובה שאתה מפספס בתכנון
// סמסטרים… לאור כמה טעויות שראיתי אני מבקש אימות סופי וודאי שלך שלא פיספסת /
// טעית באף קורס".
//
// The audit he asked for came back clean on the catalog: every mandatory
// course reaches a semester, none is unreachable, no prerequisite arrives too
// late. But it surfaced something worse, and I caused it.
//
// On 21.8 I corrected 18 courses whose semester was wrong, from the ידיעון —
// מיקרו א׳ and מיקרו ב׳ had been stored the one way round a two-part sequence
// cannot run. That fixed the catalog. It did NOT fix the plans students had
// already built against the old data, and there is no reason it would: their
// plan is theirs. So 26 rows across real accounts now sit in a semester their
// course is not offered in — most of them מיקרו כלכלה א׳ parked in spring by
// students who would have turned up to a course that was not running.
//
// A data fix that silently leaves people holding the old answer is only half a
// fix. This finds those rows so the app can say so.
//
// It does NOT move anything. Where a course sits is the student's decision,
// they may know something we do not, and rewriting a plan under someone is the
// behaviour this project refuses everywhere else.

export interface PlacementCourse {
  userCourseId: string;
  code: string;
  nameHe: string;
  /** Semesters the catalog says it is given in. Empty = unknown, never checked. */
  semesterOffered: string[];
  /** Years the catalog says it is given in. Empty = unknown. */
  yearOffered: number[];
  plannedSemester: string;
  plannedYear: number;
  status: string;
  isMandatory: boolean;
}

export interface PlacementIssue {
  userCourseId: string;
  code: string;
  nameHe: string;
  kind: "wrong-semester" | "wrong-year";
  plannedSemester: string;
  plannedYear: number;
  /** Where the catalog says it is actually given. */
  offeredSemesters: string[];
  offeredYears: number[];
  isMandatory: boolean;
}

/** Semesters that are a real teaching term. SUMMER is an extra sitting. */
const TEACHING = new Set(["FALL", "SPRING"]);

/**
 * Rows planned somewhere their course is not given.
 *
 * Only FUTURE rows are checked. A completed course was taken when it was
 * taken; telling a student their finished course "should have been" in another
 * semester is noise about a decision that cannot be revisited.
 *
 * An empty `semesterOffered` is treated as unknown rather than as a mismatch —
 * roughly a quarter of the catalog carries no timetable, and inventing a
 * complaint from missing data is how a checker becomes something people
 * dismiss.
 */
export function planPlacementIssues(courses: PlacementCourse[]): PlacementIssue[] {
  const out: PlacementIssue[] = [];

  for (const c of courses) {
    if (c.status === "COMPLETED" || c.status === "FAILED" || c.status === "EXEMPT") continue;
    if (!TEACHING.has(c.plannedSemester)) continue;

    const sems = c.semesterOffered.filter((s) => TEACHING.has(s));
    if (sems.length > 0 && !sems.includes(c.plannedSemester)) {
      out.push({
        userCourseId: c.userCourseId,
        code: c.code,
        nameHe: c.nameHe,
        kind: "wrong-semester",
        plannedSemester: c.plannedSemester,
        plannedYear: c.plannedYear,
        offeredSemesters: sems,
        offeredYears: c.yearOffered,
        isMandatory: c.isMandatory,
      });
      continue; // one issue per course — two complaints about one row is nagging
    }

    if (c.yearOffered.length > 0 && !c.yearOffered.includes(c.plannedYear)) {
      out.push({
        userCourseId: c.userCourseId,
        code: c.code,
        nameHe: c.nameHe,
        kind: "wrong-year",
        plannedSemester: c.plannedSemester,
        plannedYear: c.plannedYear,
        offeredSemesters: sems,
        offeredYears: c.yearOffered,
        isMandatory: c.isMandatory,
      });
    }
  }

  // Mandatory first: a required course in the wrong term costs a semester,
  // an elective usually costs a swap.
  return out.sort(
    (a, b) => Number(b.isMandatory) - Number(a.isMandatory) || a.nameHe.localeCompare(b.nameHe, "he"),
  );
}

/** The semester a wrong-semester row should move to, when there is exactly one. */
export function suggestedSemester(issue: PlacementIssue): "FALL" | "SPRING" | null {
  if (issue.kind !== "wrong-semester") return null;
  if (issue.offeredSemesters.length !== 1) return null;
  const s = issue.offeredSemesters[0];
  return s === "FALL" || s === "SPRING" ? s : null;
}
