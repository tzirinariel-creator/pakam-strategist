// =========================================================================
// #13/#15 (12.7) — WHICH semester does bidding actually concern?
// Always the NEXT teaching semester (the one you register/bid for), never
// the current one (you're already enrolled in those courses — "בטוח להגיש"
// on running courses was noise). Pure + tested.
// =========================================================================

import { getPlanningAnchor, getAcademicNow } from "@/lib/academic-calendar";

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

  // Ariel, #29: "אתה חותם על מוכנות לבידינג? הוא יעזור גם לשנה א׳, גם לב׳ וגם
  // לג׳?" — no, and first-years were the ones it broke.
  //
  // This used to derive the study year against getAcademicNow() and then add a
  // manual +1. On 1.9.2026 the academic "now" is still תשפ״ו (the תשפ״ז fall
  // window opens 18.10), while onboarding saves an incoming first-year with
  // startYear 2026 — the PLANNING anchor's year. So deriveYearOfStudy computed
  // 2025 − 2026 + 1 = 0, the Math.max(1, …) clamp hid "hasn't started yet" as
  // year 1, and the manual +1 turned it into 2.
  //
  // For students who started in 2025 or 2024 the two errors cancel, which is
  // why this survived: it is wrong for exactly the cohort about to register for
  // the first time. Every consumer — the planner's bidding count, the
  // year-at-a-glance card, the overlap alert and the worksheet — was handed
  // year 2, where a first-year has no rows at all, so the whole toolkit told
  // them they had planned nothing. Six days before round 1.
  //
  // The anchor already answers both questions correctly and is what /bidding
  // itself reads, so taking the semester AND the study year from it makes the
  // two screens agree by construction instead of by coincidence.
  const anchor = getPlanningAnchor(now);

  // The anchor answers WHICH ACADEMIC YEAR we are planning into, and that is
  // the half that was wrong. It does NOT answer which semester the next
  // REGISTRATION round is for: mid-fall teaching the anchor is the current
  // FALL, while the round being registered for is SPRING. Taking both from it
  // broke that case — caught by the existing test, which is why the semester
  // branch below is kept exactly as it was.
  const semester: "FALL" | "SPRING" =
    acad.semester === "FALL" && acad.phase === "teaching" ? "SPRING" : "FALL";



  // "Past the degree" has to be tested BEFORE the clamp.
  //
  // deriveYearOfStudy ends in Math.min(3, …), so it can never return 4 and a
  // `yearOfStudy > 3` test on its output is dead code. The old version happened
  // to work only because it added its own +1 AFTER the clamp — the same manual
  // +1 that broke first-years. Removing that fixed year 1 and silently disabled
  // the year-4 guard, which two tests caught in turn: a finishing student would
  // have been handed a bidding surface for a year they have nothing left to
  // register for.
  //
  // Both kinds of account are covered. With a startYear the target year is
  // simply the study year at the anchor. WITHOUT one — older accounts that only
  // ever stored a year — the stored value is the CURRENT study year, so it
  // advances exactly when the anchor has rolled into a new academic year.
  const targetYearUnclamped =
    startYear != null
      ? anchor.startYear - startYear + 1
      : storedYear + (anchor.startYear > acad.startYear ? 1 : 0);
  if (targetYearUnclamped > 3) return null;

  // ONE source for both the guard and the reported year. The first attempt
  // computed them separately — the guard advanced a no-startYear account into
  // the next study year while `yearOfStudy` did not — so the surface could
  // report year 2 while having been bounded as though it were year 3. Two
  // numbers answering one question is the shape of bug this whole file is a
  // fix for, so it is not repeated here.
  const yearOfStudy = Math.min(3, Math.max(1, targetYearUnclamped));

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
