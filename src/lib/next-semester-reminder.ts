// =========================================================================
// "If a student plans only the coming semester — when does the app remind
// them to plan the next one?"  (Ariel, 13.8.2026)
// =========================================================================
// The app had NO answer: nothing anywhere watched for a half-planned year.
// A student could finish onboarding with סמסטר א׳ filled and סמסטר ב׳ empty
// and never hear about it again.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT KNOW
// -------------------------------------------
// Ariel also asked how we tell an ANNUAL registration round (one bid covering
// both semesters) apart from a per-semester one. **We do not know which regime
// PPE is under, and nothing in this repo does.** The evidence we actually hold:
//   • bidding-calendar.ts carries exactly two rounds, both in September 2026,
//     ahead of the 18.10.26 year opening. The official documents it quotes say
//     nothing about a later round for סמסטר ב׳ — they neither promise one nor
//     rule one out.
//   • docs/pakam-domain-rules-2026.md and docs/דומיין-עומק.md describe the
//     bidding MECHANISM (2 rounds, points reset, overlap kills the earlier
//     registration) and are silent on its SCOPE.
//   • bidding-target.ts already ASSUMES a per-semester round — mid-FALL it
//     points at SPRING — but that assumption has no source behind it.
// So this module never asserts a scope. It reminds the student to plan, and
// the UI says plainly that we have no published registration dates for the
// next semester. An honest gap beats a confident guess (project iron rule:
// never invent a date, never show a number without a source).
//
// TIMING comes from the real academic calendar, never a hard-coded date, and
// the next semester's teaching start is read from TAU_CALENDARS directly — if
// the university hasn't published that year yet we return null rather than
// lean on getAcademicNow's invented "next year, mid-October" fallback.

import {
  TAU_CALENDARS,
  getAcademicNow,
  getPlanningAnchor,
  deriveYearOfStudy,
  hebrewYearLabel,
  type TeachingSemester,
} from "@/lib/academic-calendar";
import { getBiddingPhase, isBiddingRelevant } from "@/lib/bidding-calendar";

const DAY_MS = 86_400_000;

/** How early the plain calendar rollover fires. 60 days before the next
 *  semester's teaching start lands just inside the tail of the semester the
 *  student is currently sitting in — early enough to act, late enough not to
 *  be noise. */
export const ROLLOVER_LEAD_DAYS = 60;

/** The only fields we need off a plan row. */
export interface PlannedRow {
  plannedYear: number;
  plannedSemester: string;
}

export type NextSemesterReason =
  /** A published registration round is live/near and the next semester is empty. */
  | "bidding-window"
  /** The semester they planned is wrapping up; the next one is close. */
  | "semester-rollover";

export interface NextSemesterReminder {
  reason: NextSemesterReason;
  /** Study-year row (1..3) the next semester occupies in the plan. */
  yearOfStudy: number;
  semester: TeachingSemester;
  /** Academic start-year of that semester (2026 = תשפ״ז). */
  startYear: number;
  yearLabelHe: string;
  /** Published teaching start of the next semester — never estimated. */
  teachingStart: Date;
  daysUntilStart: number;
  /** Days to the next PUBLISHED bidding deadline, or null when we hold none. */
  biddingDaysUntil: number | null;
  /** Stable per-target key for a once-only dismissal. */
  key: string;
}

export interface NextSemesterReminderInput {
  courses: PlannedRow[];
  startYear: number | null | undefined;
  storedYear: number;
  now?: Date;
}

interface Slot {
  startYear: number;
  semester: TeachingSemester;
  /** Study-year row (1..3) this semester occupies in the plan. */
  studyYear: number;
}

/** The teaching semester that follows `s`. FALL→SPRING stays inside one study
 *  year; SPRING→FALL starts a new one. */
function after(s: Slot): Slot {
  return s.semester === "FALL"
    ? { startYear: s.startYear, semester: "SPRING", studyYear: s.studyYear }
    : { startYear: s.startYear + 1, semester: "FALL", studyYear: s.studyYear + 1 };
}

/** The teaching semester that precedes `s` — the inverse of `after`. */
function before(s: Slot): Slot {
  return s.semester === "SPRING"
    ? { startYear: s.startYear, semester: "FALL", studyYear: s.studyYear }
    : { startYear: s.startYear - 1, semester: "SPRING", studyYear: s.studyYear - 1 };
}

/** Published teaching start for a (year, semester), or null when TAU hasn't
 *  published that academic year. Reading the table directly is the point:
 *  getAcademicNow().nextTeachingStart falls back to a MADE-UP mid-October date
 *  once it runs off the end of the table, and we must never surface that. */
function publishedTeachingStart(startYear: number, semester: TeachingSemester): Date | null {
  const cal = TAU_CALENDARS.find((c) => c.startYear === startYear);
  return cal ? cal[semester].teachingStart : null;
}

const countIn = (rows: PlannedRow[], s: Slot) =>
  rows.filter((r) => r.plannedYear === s.studyYear && r.plannedSemester === s.semester).length;

/**
 * Is it time to nudge this student about a semester they've left empty?
 * Null = no, and null is the common answer — this must not nag.
 *
 * There are exactly two shapes of "they planned one semester and stopped", and
 * they are the same situation seen either side of a calendar rollover:
 *   (a) the planning anchor is planned and the semester AFTER it is empty
 *       (August: FALL תשפ״ז full, SPRING תשפ״ז empty);
 *   (b) teaching ended, so `getPlanningAnchor` has already rolled onto the
 *       empty semester itself, with the one before it planned (late January:
 *       anchor is SPRING תשפ״ז, and FALL תשפ״ז is what they filled).
 * Both target the SAME semester and produce the same `key`, so the nudge is
 * continuous across the rollover and one dismissal covers it.
 */
export function getNextSemesterReminder(
  input: NextSemesterReminderInput,
): NextSemesterReminder | null {
  const now = input.now ?? new Date();
  const acad = getAcademicNow(now);
  // Off-calendar: say nothing rather than guess.
  if (acad.isStale) return null;

  const raw = getPlanningAnchor(now);
  const anchor: Slot = {
    ...raw,
    studyYear: deriveYearOfStudy(input.startYear ?? null, input.storedYear, raw.startYear, now),
  };

  // Which semester is this nudge about?
  let target: Slot;
  if (countIn(input.courses, anchor) > 0) {
    // (a) the anchor is planned → look one semester further out.
    target = after(anchor);
    // PPE is a 3-year program — there is no year-4 row to fill.
    if (target.studyYear > 3) return null;
    if (countIn(input.courses, target) > 0) return null;
  } else {
    // (b) the anchor itself is empty. Only speak if the semester BEFORE it was
    // planned — that is what makes this "they planned one and stopped" rather
    // than "they have no plan at all", which is a different, louder ask that
    // the dashboard's empty-plan CTAs already own.
    const prev = before(anchor);
    if (prev.studyYear < 1 || countIn(input.courses, prev) === 0) return null;
    target = anchor;
  }

  const teachingStart = publishedTeachingStart(target.startYear, target.semester);
  if (!teachingStart) return null; // that year isn't published — stay quiet.
  // Only ever about a semester still ahead. A semester already under way with
  // nothing in it is a different problem (and the copy's "מתחיל ב-…" would be
  // false), so leave that to the planner's own empty states.
  if (teachingStart <= now) return null;

  const daysUntilStart = Math.max(0, Math.ceil((teachingStart.getTime() - now.getTime()) / DAY_MS));

  const biddingLive = isBiddingRelevant(now);
  const reason: NextSemesterReason | null = biddingLive
    ? "bidding-window"
    : daysUntilStart <= ROLLOVER_LEAD_DAYS
      ? "semester-rollover"
      : null;
  if (!reason) return null;

  return {
    reason,
    yearOfStudy: target.studyYear,
    semester: target.semester,
    startYear: target.startYear,
    yearLabelHe: hebrewYearLabel(target.startYear),
    teachingStart,
    daysUntilStart,
    biddingDaysUntil: biddingLive ? getBiddingPhase(now).daysUntil : null,
    key: `${target.startYear}-${target.semester}`,
  };
}
