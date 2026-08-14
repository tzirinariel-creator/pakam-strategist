// =========================================================================
// The one HH:MM contract — including every input the old eight disagreed on
// =========================================================================
import { describe, it, expect } from "vitest";
import {
  hhmmToMinutes,
  hhmmToHours,
  minutesToHhmm,
  hoursToHhmm,
  durationHours,
} from "@/lib/time-of-day";

describe("hhmmToMinutes — readable times", () => {
  it("parses the shapes the catalog actually holds", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("18:00")).toBe(1080);
    expect(hhmmToMinutes("9:5")).toBe(545); // single digits
    expect(hhmmToMinutes(" 10:15 ")).toBe(615); // stray whitespace
  });

  it("a bare hour keeps the meaning ALL eight old converters gave it", () => {
    expect(hhmmToMinutes("10")).toBe(600);
    expect(hhmmToMinutes("0")).toBe(0);
  });
});

describe("hhmmToMinutes — the four behaviours that used to disagree", () => {
  // Each case below had at least two different answers across the old copies:
  // 0 (combo-finder), NaN (conflict-detector), a partial number (group-options,
  // planner-conflicts), or an outright TypeError (all of them, on nullish).
  it("nullish never throws — it is NaN, not midnight", () => {
    expect(hhmmToMinutes(null)).toBeNaN();
    expect(hhmmToMinutes(undefined)).toBeNaN();
    // combo-finder used to answer 0 here, i.e. it placed the row at midnight.
    expect(hhmmToMinutes("")).toBeNaN();
  });

  it("garbage is NaN, never a number we invented", () => {
    expect(hhmmToMinutes("abc")).toBeNaN();
    expect(hhmmToMinutes("--")).toBeNaN();
    // The single sharpest divergence: 600 / 10 / NaN across the old copies.
    expect(hhmmToMinutes("10:ab")).toBeNaN();
    expect(hhmmToMinutes("10:")).toBeNaN();
    expect(hhmmToMinutes("10:30:00")).toBeNaN();
    expect(hhmmToMinutes("1030")).toBeNaN(); // 4 digits is not an hour
  });

  it("0 is reserved for a real midnight, so it can be trusted", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(Number.isNaN(hhmmToMinutes(""))).toBe(true);
  });
});

describe("hhmmToHours", () => {
  it("converts to fractional hours and preserves NaN", () => {
    expect(hhmmToHours("09:30")).toBe(9.5);
    expect(hhmmToHours("14:00")).toBe(14);
    expect(hhmmToHours("bad")).toBeNaN();
  });
});

describe("formatters round-trip", () => {
  it("minutes ↔ HH:MM", () => {
    expect(minutesToHhmm(0)).toBe("00:00");
    expect(minutesToHhmm(570)).toBe("09:30");
    expect(minutesToHhmm(1439)).toBe("23:59");
    for (const t of ["00:00", "08:15", "12:00", "23:59"]) {
      expect(minutesToHhmm(hhmmToMinutes(t))).toBe(t);
    }
  });

  it("fractional hours ↔ HH:MM", () => {
    expect(hoursToHhmm(9.5)).toBe("09:30");
    expect(hoursToHhmm(14)).toBe("14:00");
    expect(hoursToHhmm(hhmmToHours("16:45"))).toBe("16:45");
  });

  it("does not clamp past midnight — a caller's overflow stays visible", () => {
    expect(minutesToHhmm(24 * 60 + 30)).toBe("24:30");
  });
});

describe("durationHours", () => {
  it("measures a real meeting", () => {
    expect(durationHours("10:00", "12:00")).toBe(2);
    expect(durationHours("09:00", "10:30")).toBe(1.5);
  });

  it("0 means 'could not measure', for every unmeasurable case", () => {
    expect(durationHours("abc", "12:00")).toBe(0);
    expect(durationHours("10:00", null)).toBe(0);
    expect(durationHours("12:00", "10:00")).toBe(0); // negative span
    expect(durationHours("10:00", "10:00")).toBe(0); // zero span
  });
});
