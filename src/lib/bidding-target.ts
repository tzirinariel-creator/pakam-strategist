// =========================================================================
// #13/#15 (12.7) — WHICH semester does bidding actually concern?
// Always the NEXT teaching semester (the one you register/bid for), never
// the current one (you're already enrolled in those courses — "בטוח להגיש"
// on running courses was noise). Pure + tested.
// =========================================================================

import { getAcademicNow, deriveYearOfStudy } from "@/lib/academic-calendar";

export interface BiddingTarget {
  /** The plan's year-of-study (1..3) rows this bidding round fills. */
  yearOfStudy: number;
  semester: "FALL" | "SPRING";
  /** When that semester's teaching starts (bidding precedes it). */
  teachingStart: Date;
  daysUntilStart: number;
  /** Hebrew label like "סמסטר א׳" for headers. */
  labelHe: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The next teaching semester relative to `now`, mapped onto the student's
 * year-of-study. During FALL teaching → SPRING of the same study-year;
 * during/after SPRING → FALL of the NEXT study-year. Returns null when the
 * student is past the degree length — PPE is a 3-year program, so a year-3
 * student after spring has no "year 4" to bid for — or the calendar is stale.
 */
export function getBiddingTarget(
  startYear: number | null | undefined,
  storedYear: number,
  now: Date = new Date(),
): BiddingTarget | null {
  const acad = getAcademicNow(now);
  if (acad.isStale) return null;
  const currentStudyYear = deriveYearOfStudy(startYear ?? null, storedYear);

  let semester: "FALL" | "SPRING";
  let yearOfStudy: number;
  if (acad.semester === "FALL" && acad.phase === "teaching") {
    // Mid-fall: the next round is spring of the same study year.
    semester = "SPRING";
    yearOfStudy = currentStudyYear;
  } else {
    // Spring (teaching/exams) or post-fall exams/break: next round is the
    // coming FALL — a new study year.
    semester = "FALL";
    yearOfStudy = acad.semester === "FALL" ? currentStudyYear : currentStudyYear + 1;
  }
  if (yearOfStudy > 3) return null;

  const teachingStart = acad.nextTeachingStart;
  // No published start for the next semester → we cannot say how far away it
  // is, so we say nothing rather than counting down to an invented date.
  if (!teachingStart) return null;
  const daysUntilStart = Math.max(0, Math.ceil((teachingStart.getTime() - now.getTime()) / DAY_MS));
  return {
    yearOfStudy,
    semester,
    teachingStart,
    daysUntilStart,
    labelHe: semester === "FALL" ? "סמסטר א׳" : "סמסטר ב׳",
  };
}

/** Bidding "season" — close enough to the next semester that the round is
 *  actionable. TAU never publishes exact bid dates, so this is a WINDOW for
 *  surfacing tools, never a claimed date. */
export function isBiddingSeason(target: BiddingTarget | null): boolean {
  return target != null && target.daysUntilStart <= 45;
}
