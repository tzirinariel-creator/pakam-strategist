// =========================================================================
// Bidding calendar — the real תשפ״ז registration dates
// =========================================================================
// The app already explained HOW bidding works (bidding-explainer) and did the
// arithmetic (bidding-worksheet), but it knew NOTHING about WHEN — so a
// student could not tell from Pakamon whether the round opens tomorrow or
// closed last week. Ariel: "יש לי גם רגע תאריכים של הבידינג … מאוד רלוונטי
// להצליח לעזור לסטודנטים להתכונן לזה".
//
// SOURCE (verbatim, both official documents Ariel exported on 13.8.2026):
//   • "הנחיות לרישום בבידינג תשפז.doc"  — Faculty of Humanities
//   • "הזמנה - תואר ראשון תלמידים ממשיכים- בידינג תשפז.doc" — PPE staff
//   • "מידע על תאריכי הרישום.docx"
// Every timestamp below is quoted from those files. Nothing is estimated —
// the project's iron rule forbids inventing a date, and a wrong bidding
// deadline is the single most expensive error this app could make.
//
// NOTE ON POINTS: these documents also publish per-student point pools and
// prior-year statistics. We deliberately store NONE of that. TAU's quota is
// unpublished and varies; the guidelines themselves say past results are
// "לידיעה בלבד ואין להסיק מהן". Predicting points stays forbidden.

/** A single bidding round. All times are Israel local time. */
import { civilDaysBetween } from "@/lib/civil-day";

export interface BiddingRound {
  round: 1 | 2;
  /** Round opens (inclusive). */
  opens: Date;
  /** Round closes — after this the system stops accepting preferences. */
  closes: Date;
  /** When results are published ("בשעות הצהריים" — noon-ish, so we anchor 12:00). */
  results: Date;
}

/** Israel-local Date. The app runs on a UTC server, so build the date from
 *  parts against a fixed offset rather than trusting the host timezone.
 *  Israel is UTC+3 in September/October (IDT), which is the whole window. */
function il(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 3, minute));
}

/**
 * תשפ״ז bidding rounds — quoted from the official guidelines:
 *   "מקצה ראשון: 7.9.26 משעה 11:00 עד 15.9.26 בשעה 10:00"
 *   "תוצאות המכרז יפורסמו ב-16.9.26 בשעות הצהריים"
 *   "מקצה שני: 23.9.26 משעה 11:00 עד 5.10.26 בשעה 10:00"
 *   "תוצאות המכרז יפורסמו ב-6.10.26 בשעות הצהריים"
 */
export const BIDDING_ROUNDS_5787: BiddingRound[] = [
  { round: 1, opens: il(2026, 9, 7, 11), closes: il(2026, 9, 15, 10), results: il(2026, 9, 16, 12) },
  { round: 2, opens: il(2026, 9, 23, 11), closes: il(2026, 10, 5, 10), results: il(2026, 10, 6, 12) },
];

/** Other dated milestones from the same documents. */
export const BIDDING_MILESTONES_5787 = {
  /** "מפגש הסבר והדרכה לתלמידים חדשים … יום שני, 7.9.26, בשעה 10:00 בזום" */
  newStudentBriefing: il(2026, 9, 7, 10),
  newStudentBriefingUrl: "https://tau-ac-il.zoom.us/j/82882508740",
  /** "שנת הלימודים תיפתח ביום ראשון, 18.10.26" */
  yearStarts: il(2026, 10, 18, 0),
  /** "ניתן לבטל רישום לקורסים … בין התאריכים 18.10.26-29.10.26 (בשעה 23:59)" */
  cancelWindowStart: il(2026, 10, 18, 0),
  cancelWindowEnd: il(2026, 10, 29, 23, 59),
  /** "בשבוע השני ללימודים 25-29 באוקטובר 2026, ניתן לפנות לחוגים לשינויים" */
  changesWeekStart: il(2026, 10, 25, 0),
  changesWeekEnd: il(2026, 10, 29, 23, 59),
} as const;

export const BIDDING_LINKS = {
  system: "https://www.ims.tau.ac.il/Bidd/",
  help: "https://www.ims.tau.ac.il/Bidd/Help/Help.aspx",
  video: "https://humanities.tau.ac.il/biding_video",
  results: "http://www.ims.tau.ac.il/",
} as const;

export type BiddingPhaseKind =
  /** Before round 1 opens — this is the PREPARE window. */
  | "before"
  /** A round is accepting preferences right now. */
  | "open"
  /** Round closed, results not out yet. */
  | "awaiting-results"
  /** Between round-1 results and round-2 opening — the cancel/re-plan window. */
  | "between-rounds"
  /** Both rounds done. */
  | "done";

export interface BiddingPhase {
  kind: BiddingPhaseKind;
  /** The round this phase refers to (the active or next one). */
  round?: 1 | 2;
  /** The next deadline the student should care about, if any. */
  deadline?: Date;
  /** Whole days until `deadline` (0 = today). Null when there is no deadline. */
  daysUntil: number | null;
}

// Whole-day difference on ISRAELI civil days ("closes tomorrow" = 1). It used
// to bucket both instants by their UTC components, so a student checking at
// 00:30 on closing day — 21:30Z the previous day — was told the round "נסגר
// מחר" when it actually closed in nine hours. This file's own header calls a
// wrong bidding deadline the most expensive error the app can make.
// Imported from @/lib/civil-day (single source).

/**
 * Where the student stands relative to the bidding calendar right now.
 * Pure + injectable clock so it is unit-testable and never drifts with the
 * host timezone.
 */
export function getBiddingPhase(
  now: Date = new Date(),
  rounds: BiddingRound[] = BIDDING_ROUNDS_5787,
): BiddingPhase {
  const sorted = [...rounds].sort((a, b) => a.opens.getTime() - b.opens.getTime());
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return { kind: "done", daysUntil: null };

  if (now < first.opens) {
    return { kind: "before", round: first.round, deadline: first.opens, daysUntil: civilDaysBetween(now, first.opens) };
  }
  for (const r of sorted) {
    if (now >= r.opens && now < r.closes) {
      return { kind: "open", round: r.round, deadline: r.closes, daysUntil: civilDaysBetween(now, r.closes) };
    }
    if (now >= r.closes && now < r.results) {
      return { kind: "awaiting-results", round: r.round, deadline: r.results, daysUntil: civilDaysBetween(now, r.results) };
    }
  }
  // After a round's results but before the next round opens.
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    if (now >= cur.results && now < next.opens) {
      return { kind: "between-rounds", round: next.round, deadline: next.opens, daysUntil: civilDaysBetween(now, next.opens) };
    }
  }
  return { kind: "done", daysUntil: null };
}

/** Is the bidding window close enough that prep is the student's real job? */
export function isBiddingRelevant(now: Date = new Date()): boolean {
  const phase = getBiddingPhase(now);
  if (phase.kind === "done") return false;
  // "before" only matters once it's near — a countdown in March is noise.
  if (phase.kind === "before") return (phase.daysUntil ?? 999) <= 45;
  return true;
}

/**
 * Do the dates in this file still describe the student's own registration
 * cycle? True until the תשפ״ז changes week closes (29.10.26) — after that the
 * NEXT cycle's dates are simply unpublished, and "בידינג הסתיים" would be a
 * lie of omission rather than a fact. Nothing here invents the next cycle;
 * this flag only lets the UI say "we don't have those dates yet".
 */
export function hasCurrentBiddingCycle(now: Date = new Date()): boolean {
  return now <= BIDDING_MILESTONES_5787.changesWeekEnd;
}
