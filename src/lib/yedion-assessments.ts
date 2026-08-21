// =========================================================================
// The ידיעון's exam dates and paper deadlines
// =========================================================================
// Backed by src/data/yedion-5787-assessments.json, generated from the ידיעון's
// own "לוח בחינות ומטלות" page by scripts/parse-yedion-assessments.ts.
//
// 269 courses with BOTH sittings dated, 538 dated sittings, 289 paper
// deadlines. Verified twice over: 6/6 against Ariel's screenshots of the page
// itself, and 4/4 against bid-it, an independent planner run by the student
// association.
//
// (An earlier version of the parser reported that the ידיעון published no exam
// dates at all. That was a regex bug of mine — `<w:t[^>]*>` also matches
// `<w:tbl>`/`<w:tc>` — and Ariel caught it by looking at the real page. The
// dates were there the whole time. The note is kept because "the source has no
// data" is exactly the kind of conclusion that must never go unchallenged.)
//
// This is a SECONDARY source. A date already in our catalog, or one the student
// typed, always wins — the catalog is what the scraper maintains and the
// student is the final authority on their own exam.
import raw from "@/data/yedion-5787-assessments.json";

export interface YedionSitting {
  sitting: "A" | "B";
  /** ISO date, e.g. "2027-01-28". */
  date: string;
  dayOfWeek: string | null;
  time: string | null;
}

export interface YedionAssessment {
  courseCode: string;
  courseName: string;
  semester: string | null;
  group: string | null;
  assessmentType: string | null;
  sittings: YedionSitting[];
  dueDate: string | null;
}

const RECORDS = (raw as { records: YedionAssessment[] }).records;

const BY_CODE = new Map<string, YedionAssessment[]>();
for (const r of RECORDS) {
  const list = BY_CODE.get(r.courseCode);
  if (list) list.push(r);
  else BY_CODE.set(r.courseCode, [r]);
}

export function assessmentsFor(courseCode: string | null | undefined): YedionAssessment[] {
  if (!courseCode) return [];
  return BY_CODE.get(courseCode.trim()) ?? [];
}

/**
 * Pick the record for this course, preferring the student's own group.
 * Different groups of the same course can genuinely sit at different times.
 */
function recordFor(
  courseCode: string | null | undefined,
  group: string | null | undefined,
  predicate: (r: YedionAssessment) => boolean,
): YedionAssessment | null {
  const rows = assessmentsFor(courseCode).filter(predicate);
  if (rows.length === 0) return null;
  return (
    (group ? rows.find((r) => r.group === group) : undefined) ??
    rows.find((r) => r.group === "כל הקבוצות") ??
    rows[0]!
  );
}

/** Both sittings, with real dates, as the ידיעון prints them. */
export function examSittingsFor(
  courseCode: string | null | undefined,
  group?: string | null,
): YedionSitting[] {
  return recordFor(courseCode, group, (r) => r.sittings.length > 0)?.sittings ?? [];
}

/**
 * The ידיעון's dates for a course, as Date objects — the shape the exam planner
 * already speaks. Returns nulls when the ידיעון says nothing, never a guess.
 */
export function yedionExamDates(
  courseCode: string | null | undefined,
  group?: string | null,
): { examDateA: Date | null; examDateB: Date | null } {
  const sittings = examSittingsFor(courseCode, group);
  const pick = (s: "A" | "B") => {
    const hit = sittings.find((x) => x.sitting === s);
    if (!hit?.date) return null;
    // Parsed as a UTC calendar day, matching how the catalog stores exam dates.
    const d = new Date(`${hit.date}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const examDateA = pick("A");
  const examDateB = pick("B");
  // A course cannot sit both mועדים on the same day. Exactly one row in the
  // board parses that way (1882-0301, both sittings 25.12.2026 09:30), which
  // means the second sitting's cell was not read — not that it happens then.
  // Keeping the first and dropping the second is the honest reading: we know
  // one date and we do not know the other, and telling a student their מועד ב׳
  // is the same morning as their מועד א׳ is worse than telling them nothing.
  if (examDateA && examDateB && examDateA.getTime() === examDateB.getTime()) {
    return { examDateA, examDateB: null };
  }
  return { examDateA, examDateB };
}

/** The paper/assignment deadline the ידיעון prints, as ISO, or null. */
export function paperDeadlineFor(
  courseCode: string | null | undefined,
  group?: string | null,
): string | null {
  return recordFor(courseCode, group, (r) => !!r.dueDate)?.dueDate ?? null;
}

const DAY_HE: Record<string, string> = {
  SUNDAY: "ראשון", MONDAY: "שני", TUESDAY: "שלישי",
  WEDNESDAY: "רביעי", THURSDAY: "חמישי", FRIDAY: "שישי", SATURDAY: "שבת",
};

/** "מועד א׳ · יום חמישי, 09:00" — the day/time detail the catalog lacks. */
export function describeSitting(s: YedionSitting, isHe = true): string {
  const label = isHe
    ? s.sitting === "A" ? "מועד א׳" : "מועד ב׳"
    : s.sitting === "A" ? "1st sitting" : "2nd sitting";
  const day = s.dayOfWeek
    ? isHe ? `יום ${DAY_HE[s.dayOfWeek] ?? ""}` : s.dayOfWeek.charAt(0) + s.dayOfWeek.slice(1).toLowerCase()
    : null;
  return [label, [day, s.time].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}

/** Coverage, for honest reporting rather than a claim of completeness. */
export function coverage(): { courses: number; datedSittings: number; deadlines: number } {
  return {
    courses: RECORDS.filter((r) => r.sittings.length > 0).length,
    datedSittings: RECORDS.flatMap((r) => r.sittings).filter((s) => s.date).length,
    deadlines: RECORDS.filter((r) => r.dueDate).length,
  };
}
