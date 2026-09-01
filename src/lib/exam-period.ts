// =========================================================================
// One exam period at a time
// =========================================================================
// Ariel, four times, escalating:
//   #42 "למה הוא מראה לי מבחנים שסיימתי?"
//   #43 "למה אני מתכנן מבחנים של שנה שלמה במקום של סמסטר קרוב? זה גרוע"
//   #44 "ושוב פעם לוח מבחנים בלתי נגמר שאי אפשר להבין ממנו כלום… רגע תכנון
//        מבחנים מצומצם לסמסטר שמציג את החודש לפני התקופת מבחנים ותוך כדי"
//
// The picker was fed EVERY course still ahead of the student — all three years,
// both semesters — with no scope at all. Plan a degree in September and the
// board offers you January's sittings and June's in one undifferentiated list,
// then draws a grid spanning both. That is the "בלתי נגמר" board: it is not too
// dense, it is answering a question nobody asked ("when is every exam I will
// ever sit") instead of the one they did ("what am I revising for now").
//
// A university exam period is a real, observable thing: a cluster of sittings
// separated from the next cluster by a teaching semester. So the periods are
// DERIVED from the dates we hold rather than declared from invented calendar
// boundaries — no hardcoded "January is winter", nothing to drift, and it works
// for a student whose plan happens to straddle an unusual term.
//
// The gap that separates two periods is deliberately generous: sittings inside
// one period run across roughly a month, and מועד ב׳ can trail three to five
// weeks behind מועד א׳. Anything under that stays in the same cluster.

const DAY = 86_400_000;

/** Days of quiet that mark the boundary between two exam periods. */
export const PERIOD_GAP_DAYS = 45;

export interface DatedSitting {
  /** Whatever the caller wants back — this module only reads `when`. */
  when: Date;
}

export interface ExamPeriod<T extends DatedSitting> {
  from: Date;
  to: Date;
  sittings: T[];
}

/**
 * Cluster sittings into exam periods, earliest first.
 *
 * A period ends when the next sitting is more than PERIOD_GAP_DAYS away — i.e.
 * when a teaching semester sits between them.
 */
export function groupIntoPeriods<T extends DatedSitting>(sittings: readonly T[]): ExamPeriod<T>[] {
  const sorted = [...sittings].sort((a, b) => a.when.getTime() - b.when.getTime());
  const periods: ExamPeriod<T>[] = [];
  for (const s of sorted) {
    const last = periods[periods.length - 1];
    if (last && s.when.getTime() - last.to.getTime() <= PERIOD_GAP_DAYS * DAY) {
      last.to = s.when;
      last.sittings.push(s);
    } else {
      periods.push({ from: s.when, to: s.when, sittings: [s] });
    }
  }
  return periods;
}

/**
 * The period a student is actually heading into.
 *
 * "Upcoming" means the first period that has not finished yet — so during an
 * exam period you keep seeing the one you are IN, rather than being pushed
 * forward to the next one the moment your first sitting passes. That is the
 * "ותוך כדי" half of Ariel's note, and it is the half a naive
 * "first period starting after today" rule gets wrong.
 */
export function upcomingPeriod<T extends DatedSitting>(
  sittings: readonly T[],
  now: Date = new Date(),
): ExamPeriod<T> | null {
  const periods = groupIntoPeriods(sittings);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return periods.find((p) => p.to.getTime() >= today) ?? periods[periods.length - 1] ?? null;
}

/** Periods after the upcoming one — what a "show the rest" affordance offers. */
export function laterPeriods<T extends DatedSitting>(
  sittings: readonly T[],
  now: Date = new Date(),
): ExamPeriod<T>[] {
  const periods = groupIntoPeriods(sittings);
  const current = upcomingPeriod(sittings, now);
  if (!current) return [];
  return periods.filter((p) => p.from.getTime() > current.to.getTime());
}

/** A human label for a period, from its own dates — never an invented season. */
export function periodLabel(p: ExamPeriod<DatedSitting>, isHe: boolean): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(isHe ? "he-IL" : "en-GB", { day: "numeric", month: "long" });
  const sameMonth =
    p.from.getFullYear() === p.to.getFullYear() && p.from.getMonth() === p.to.getMonth();
  const year = p.to.getFullYear();
  if (sameMonth) {
    const month = p.from.toLocaleDateString(isHe ? "he-IL" : "en-GB", { month: "long" });
    return isHe ? `תקופת המבחנים — ${month} ${year}` : `Exam period — ${month} ${year}`;
  }
  return isHe
    ? `תקופת המבחנים — ${fmt(p.from)} עד ${fmt(p.to)}`
    : `Exam period — ${fmt(p.from)} to ${fmt(p.to)}`;
}
