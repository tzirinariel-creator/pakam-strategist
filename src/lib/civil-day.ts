// =========================================================================
// Civil days, in Israel — the ONE place "what day is it for the student" lives
// =========================================================================
// The server runs UTC; every student is in Israel (UTC+2 / UTC+3). Between
// 00:00 and 03:00 Israel time the two disagree about which DAY it is, and every
// countdown the app shows is a civil-day count: "המבחן היום", "המקצה נסגר מחר",
// "נשארו 3 ימים ללימודים". A `new Date()` bucketed by its UTC components is
// therefore YESTERDAY for the first three hours of every Israeli day.
//
// Three idioms for this had grown side by side (local midnight, UTC midnight, a
// hardcoded +3h offset), so two adjacent surfaces could disagree about the same
// exam. These helpers are the single source: they resolve through
// Intl.DateTimeFormat with a pinned Asia/Jerusalem zone, so they give the same
// answer on a UTC server, on an Israeli laptop, and on a student's phone abroad
// — and they survive the DST flip, which a fixed offset does not.
//
// NOTE for tests: the suite pins TZ=Asia/Jerusalem (vitest.config.ts), which
// hides exactly this class of bug. Everything here is host-timezone independent
// by construction, so a test that passes an explicit instant proves the
// production (UTC) behaviour too.

const IL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jerusalem",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface CivilDateParts {
  year: number;
  /** 1-based, as a human writes it. */
  month: number;
  day: number;
}

/** The Israel civil calendar date of an instant. */
export function israelCivilParts(now: Date = new Date()): CivilDateParts {
  const parts = IL_PARTS.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * A stable integer key for an Israel civil day: the UTC-midnight epoch ms of
 * that calendar date. Two instants on the same Israeli day share one key, in
 * any host timezone — so `a === b` is "same day" and `(a - b) / 86400000` is a
 * whole number of civil days, DST included.
 */
export function israelDayKeyMs(now: Date = new Date()): number {
  const { year, month, day } = israelCivilParts(now);
  return Date.UTC(year, month - 1, day);
}

/**
 * Whole civil days from `from` to `to`, counted in Israel. Positive = `to` is
 * later. 0 = the same Israeli day (i.e. "today"), 1 = "tomorrow".
 */
export function civilDaysBetween(from: Date, to: Date): number {
  return Math.round((israelDayKeyMs(to) - israelDayKeyMs(from)) / 86_400_000);
}

/**
 * "Today" as the Israel civil date, returned as a Date whose HOST-LOCAL Y/M/D
 * equal that civil date — so local-component day keys (`startOfDay`/`dayKey` in
 * exam-planner and the skyline) produce Israel day keys even on a UTC server.
 * On the client this already equals `new Date()`; the point is the server.
 */
export function israelCivilDate(now: Date = new Date()): Date {
  const { year, month, day } = israelCivilParts(now);
  return new Date(year, month - 1, day);
}

/**
 * The civil day of a DATE-ONLY value stored at UTC midnight (exam dates, form
 * dates, anything written as `YYYY-MM-DD`). Such a value carries no time of
 * day, so it must be read by its UTC components — reading it in a local zone is
 * what shifted exams a day for anyone west of Greenwich. Returns the same
 * integer key as `israelDayKeyMs`, so the two are directly comparable.
 */
export function storedDateKeyMs(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Whole civil days from TODAY (in Israel) to a DATE-ONLY stored value — the one
 * countdown every exam surface uses: 0 = the exam is today, 1 = tomorrow,
 * negative = already past.
 *
 * This is the composition `storedDateKeyMs(exam) - israelDayKeyMs(now)`, named
 * once. It exists because four surfaces each spelled it out differently — two of
 * them by server-local midnight — and so disagreed about the same exam for the
 * first three hours of every Israeli day: the dashboard countdown listed
 * YESTERDAY's exam as "היום" while the schedule board had already dropped it.
 * Exam dates carry no time of day, so the exam side MUST be read by its UTC
 * components and the "today" side MUST be resolved in Israel; mixing the two
 * bases is the whole bug. Reach for this instead of writing the subtraction.
 */
export function civilDaysUntilStored(d: Date | string, now: Date = new Date()): number {
  return Math.round((storedDateKeyMs(d) - israelDayKeyMs(now)) / 86_400_000);
}
