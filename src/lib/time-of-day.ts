// =========================================================================
// "HH:MM" — the ONE parser, with ONE contract
// =========================================================================
// Timetable times reach us as strings off the ידיעון (`scraper/parser.ts` splits
// the "שעות" cell on "-" and stores whatever it finds, unvalidated). Eight
// separate converters had grown to read them, with FOUR different answers for
// the same bad input — the same "10:ab" was 600 minutes in one module, 10 hours
// in another, and NaN in two more — and every one of them threw a TypeError on
// a null field, because they all called `.split()` on it directly.
//
// The contract here, in one sentence: a time we can read becomes a number, and
// a time we cannot read becomes NaN. Never 0 (which is a real time — midnight —
// and so silently placed a broken row at the top of the grid), never a throw.
// NaN propagates, so a caller that needs a fallback must say so out loud; that
// is the app's rule about never showing a number we don't actually have.
//
// Accepted: "HH:MM", "H:M", and a bare "HH" (minutes default to 0) — the last
// because ALL EIGHT of the old converters accepted it, and unifying is not a
// licence to change what valid-ish data means. Surrounding whitespace is fine.
// Anything else — "", "abc", "10:ab", null, undefined — is NaN.

const HHMM = /^\s*(\d{1,2})(?::(\d{1,2}))?\s*$/;

/** "HH:MM" → minutes since midnight. NaN when unreadable (never throws). */
export function hhmmToMinutes(time: string | null | undefined): number {
  const m = HHMM.exec(time ?? "");
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

/** "HH:MM" → fractional hours (09:30 → 9.5). NaN when unreadable. */
export function hhmmToHours(time: string | null | undefined): number {
  return hhmmToMinutes(time) / 60;
}

/**
 * Minutes since midnight → "HH:MM". Hours are NOT clamped to 24 — a caller that
 * adds an hour to 23:30 gets "24:30" and can see its own bug.
 */
export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fractional hours → "HH:MM" (9.5 → "09:30"). */
export function hoursToHhmm(hours: number): string {
  return minutesToHhmm(Math.round(hours * 60));
}

/**
 * "HH:MM" → minutes since midnight, or an EXPLICIT fallback when unreadable.
 * For the handful of callers that genuinely must produce a time no matter what
 * (the .ics file and the Google Calendar push both have to emit *some* DTSTART):
 * they state the fallback out loud instead of letting NaN reach `setHours` and
 * silently write an Invalid Date into the export.
 */
export function hhmmToMinutesOr(
  time: string | null | undefined,
  fallbackMinutes: number,
): number {
  const m = hhmmToMinutes(time);
  return Number.isFinite(m) ? m : fallbackMinutes;
}

/**
 * The duration of a meeting in hours, or 0 when either end is unreadable or the
 * span is not positive. The explicit "0 = we could not measure this" fallback
 * some callers want, spelled once instead of five times.
 */
export function durationHours(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): number {
  const diff = hhmmToHours(endTime) - hhmmToHours(startTime);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}
