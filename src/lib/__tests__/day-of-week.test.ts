// =========================================================================
// The complete day map, and the local-midnight day math
// =========================================================================
// Twelve day maps existed. Most are NOT duplicates — see the note at the foot
// of lib/day-of-week.ts — but the ones that ARE all agreed on the same 0-based
// SUNDAY-first index, and three of them just stopped at FRIDAY and fell through
// `?? 0`, i.e. they turned SATURDAY into SUNDAY: a wrong day, not a missing one.
import { describe, it, expect } from "vitest";
import {
  DAY_OF_WEEK_ORDER,
  DAY_OF_WEEK_INDEX,
  dayOfWeekIndex,
  jsDayToDayOfWeek,
  dayShortFor,
} from "@/lib/day-of-week";
import { startOfDay, addDays, dayKey, daysBetween } from "@/lib/local-day";

describe("day-of-week — 0-based, Sunday first, all seven", () => {
  it("agrees with Date.prototype.getDay() for a real week", () => {
    // 2026-08-16 is a Sunday. Noon avoids any midnight ambiguity.
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 7, 16 + i, 12);
      expect(dayOfWeekIndex(DAY_OF_WEEK_ORDER[i]!)).toBe(d.getDay());
      expect(jsDayToDayOfWeek(d.getDay())).toBe(DAY_OF_WEEK_ORDER[i]);
    }
  });

  it("SATURDAY is 6 — it does not fall through to Sunday", () => {
    expect(DAY_OF_WEEK_INDEX.SATURDAY).toBe(6);
    expect(dayOfWeekIndex("SATURDAY")).toBe(6);
    expect(dayOfWeekIndex("SATURDAY")).not.toBe(0);
  });

  it("an unknown day is undefined, so a caller must state its own fallback", () => {
    expect(dayOfWeekIndex("CATURDAY")).toBeUndefined();
    expect(jsDayToDayOfWeek(7)).toBeUndefined();
  });

  it("the short label covers the whole week in both languages", () => {
    expect(dayShortFor("SUNDAY", true)).toBe("א׳");
    // FRIDAY was missing from both copies of this map, so a Friday meeting
    // rendered the raw enum "FRIDAY" inside a Hebrew screen.
    expect(dayShortFor("FRIDAY", true)).toBe("ו׳");
    expect(dayShortFor("SATURDAY", true)).toBe("ש׳");
    expect(dayShortFor("FRIDAY", false)).toBe("Fri");
    expect(dayShortFor("NOPE", true)).toBe("NOPE");
  });
});

describe("local-day — the exam-planner / skyline convention", () => {
  it("startOfDay snaps to LOCAL midnight and leaves the calendar date alone", () => {
    const d = new Date(2026, 7, 15, 23, 45, 30, 500);
    const s = startOfDay(d);
    expect([s.getFullYear(), s.getMonth(), s.getDate()]).toEqual([2026, 7, 15]);
    expect([s.getHours(), s.getMinutes(), s.getSeconds(), s.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it("dayKey is the LOCAL date, never the UTC one toISOString would give", () => {
    const d = new Date(2026, 7, 15, 0, 30); // local, just after midnight
    expect(dayKey(d)).toBe("2026-08-15");
    // The bug this convention exists to avoid: in Israel (UTC+2/+3) the same
    // instant is the 14th in UTC, which is what toISOString would print.
    expect(dayKey(d)).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  });

  it("addDays and daysBetween are whole days, DST included", () => {
    const start = new Date(2026, 2, 26, 9); // 26.3.2026, before the Israeli flip
    expect(dayKey(addDays(start, 4))).toBe("2026-03-30");
    expect(daysBetween(start, addDays(start, 4))).toBe(4);
    expect(daysBetween(addDays(start, 4), start)).toBe(-4);
    expect(daysBetween(start, start)).toBe(0);
  });
});
