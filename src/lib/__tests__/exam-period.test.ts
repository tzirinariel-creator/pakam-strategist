// =========================================================================
// One exam period at a time (#43, #44)
// =========================================================================
// Ariel, four times: "למה אני מתכנן מבחנים של שנה שלמה במקום של סמסטר קרוב?
// זה גרוע" · "ושוב פעם לוח מבחנים בלתי נגמר שאי אפשר להבין ממנו כלום".
//
// The picker was fed every course still ahead of the student, so a plan built
// in September offered January's sittings and June's in one list and drew a
// grid spanning both. The board was not too dense — it was answering "when is
// every exam I will ever sit" instead of "what am I revising for now".
//
// Periods are DERIVED from the dates we hold, not from invented calendar
// boundaries, so nothing drifts and an unusual term still works.

import { describe, it, expect } from "vitest";
import {
  groupIntoPeriods,
  upcomingPeriod,
  laterPeriods,
  periodLabel,
  PERIOD_GAP_DAYS,
} from "@/lib/exam-period";

const d = (y: number, m: number, day: number) => ({ when: new Date(y, m - 1, day) });

// A real תשפ״ז shape: a January cluster (with מועד ב׳ trailing into February)
// and a June cluster.
const YEAR = [
  d(2027, 1, 20), d(2027, 1, 28), d(2027, 2, 5), d(2027, 2, 18),
  d(2027, 6, 20), d(2027, 6, 28), d(2027, 7, 12),
];

describe("sittings cluster into the periods they actually form", () => {
  it("splits a year into two periods, not seven", () => {
    expect(groupIntoPeriods(YEAR)).toHaveLength(2);
  });

  it("keeps מועד ב׳ in the same period as its מועד א׳", () => {
    // A B-sitting trails three to five weeks behind. Splitting them would
    // scatter one exam period across two, which is the opposite of the fix.
    const [winter] = groupIntoPeriods(YEAR);
    expect(winter!.sittings).toHaveLength(4);
    expect(winter!.to.getMonth()).toBe(1); // February
  });

  it("does not merge two periods a teaching semester apart", () => {
    const [, summer] = groupIntoPeriods(YEAR);
    expect(summer!.from.getMonth()).toBe(5); // June
  });

  it("puts an exactly-at-the-gap sitting in the same period", () => {
    // The boundary is inclusive, so a period never silently splits at the edge.
    const base = new Date(2027, 0, 20);
    const atGap = new Date(base.getTime() + PERIOD_GAP_DAYS * 86_400_000);
    expect(groupIntoPeriods([{ when: base }, { when: atGap }])).toHaveLength(1);
  });
});

describe("the upcoming period is the one you are heading into", () => {
  it("in September, that is January — not June", () => {
    const p = upcomingPeriod(YEAR, new Date(2026, 8, 1));
    expect(p!.from.getMonth()).toBe(0);
    expect(p!.sittings).toHaveLength(4);
  });

  it("MID-period it stays the period you are IN", () => {
    // "ותוך כדי" — the half a naive "first period starting after today" rule
    // gets wrong: your first sitting passing must not push you to June.
    const p = upcomingPeriod(YEAR, new Date(2027, 0, 25));
    expect(p!.from.getMonth()).toBe(0);
  });

  it("moves on only once the whole period is behind you", () => {
    const p = upcomingPeriod(YEAR, new Date(2027, 2, 1));
    expect(p!.from.getMonth()).toBe(5);
  });

  it("on the last day of a period, still that period", () => {
    const p = upcomingPeriod(YEAR, new Date(2027, 1, 18));
    expect(p!.from.getMonth()).toBe(0);
  });

  it("returns the last period rather than nothing when everything is past", () => {
    // Never a blank screen: showing the most recent period is more useful than
    // showing none, and the caller can still say it is behind you.
    const p = upcomingPeriod(YEAR, new Date(2028, 0, 1));
    expect(p!.from.getMonth()).toBe(5);
  });

  it("is null only when there are no sittings at all", () => {
    expect(upcomingPeriod([], new Date(2026, 8, 1))).toBeNull();
  });
});

describe("the rest stays reachable", () => {
  it("offers June as a later period while January is upcoming", () => {
    const later = laterPeriods(YEAR, new Date(2026, 8, 1));
    expect(later).toHaveLength(1);
    expect(later[0]!.from.getMonth()).toBe(5);
  });

  it("offers nothing later once you are in the final period", () => {
    expect(laterPeriods(YEAR, new Date(2027, 5, 25))).toHaveLength(0);
  });
});

describe("the label is built from the period's own dates", () => {
  it("names a single month when the period sits inside one", () => {
    const p = groupIntoPeriods([d(2027, 6, 20), d(2027, 6, 28)])[0]!;
    expect(periodLabel(p, true)).toMatch(/תקופת המבחנים/);
    expect(periodLabel(p, true)).toMatch(/2027/);
  });

  it("spans two dates when the period crosses a month", () => {
    const p = groupIntoPeriods([d(2027, 1, 20), d(2027, 2, 18)])[0]!;
    expect(periodLabel(p, true)).toMatch(/עד/);
  });

  it("never invents a season name", () => {
    // "January is winter" is a claim about the calendar we do not need to make.
    const p = groupIntoPeriods(YEAR)[0]!;
    expect(periodLabel(p, true)).not.toMatch(/חורף|קיץ|אביב/);
  });
});
