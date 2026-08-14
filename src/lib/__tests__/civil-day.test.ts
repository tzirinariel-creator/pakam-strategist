// =========================================================================
// Civil-day helpers — proven with EXPLICIT UTC instants
// =========================================================================
// vitest.config.ts pins TZ=Asia/Jerusalem, which structurally HIDES this whole
// bug class: every "server-local midnight" implementation looks correct on a
// machine that is already in Israel. So no test here may rely on the host zone.
// Each case states an exact UTC instant and the Israeli civil day it belongs to,
// which is what production (a UTC server) and a student's phone actually see.
//
// The window that matters: 21:00/22:00 UTC → 00:00/01:00 Israel. UTC still calls
// it yesterday; the student is already on the next day. Every countdown the app
// shows is a CIVIL-day count, so it must follow the student, not the server.
import { describe, it, expect } from "vitest";
import {
  israelCivilParts,
  israelDayKeyMs,
  civilDaysBetween,
  storedDateKeyMs,
  civilDaysUntilStored,
} from "@/lib/civil-day";

/** The two instants that break a server-local implementation, spelled out. */
// 2026-08-14T21:30Z = 15.8 00:30 in Israel (IDT, UTC+3) — a NEW Israeli day.
const JUST_AFTER_IL_MIDNIGHT = new Date("2026-08-14T21:30:00Z");
// 2026-01-14T22:30Z = 15.1 00:30 in Israel (IST, UTC+2) — same, in winter.
const JUST_AFTER_IL_MIDNIGHT_WINTER = new Date("2026-01-14T22:30:00Z");

describe("israelCivilParts / israelDayKeyMs — the day the STUDENT is on", () => {
  it("21:30 UTC in August is already the NEXT day in Israel (UTC+3)", () => {
    expect(israelCivilParts(JUST_AFTER_IL_MIDNIGHT)).toEqual({
      year: 2026,
      month: 8,
      day: 15,
    });
    expect(israelDayKeyMs(JUST_AFTER_IL_MIDNIGHT)).toBe(Date.UTC(2026, 7, 15));
    // The server's own UTC components say the 14th — that disagreement IS the bug.
    expect(JUST_AFTER_IL_MIDNIGHT.getUTCDate()).toBe(14);
  });

  it("survives the DST flip: 22:30 UTC in January is the next day too (UTC+2)", () => {
    expect(israelCivilParts(JUST_AFTER_IL_MIDNIGHT_WINTER)).toEqual({
      year: 2026,
      month: 1,
      day: 15,
    });
    // 21:30Z in JANUARY is still the 14th — a fixed +3 offset would get this wrong.
    expect(israelCivilParts(new Date("2026-01-14T21:30:00Z")).day).toBe(14);
  });

  it("midday UTC is unambiguous in both directions", () => {
    expect(israelDayKeyMs(new Date("2026-08-14T12:00:00Z"))).toBe(Date.UTC(2026, 7, 14));
  });
});

describe("civilDaysBetween", () => {
  it("counts whole days, ignoring the time of day on either side", () => {
    expect(
      civilDaysBetween(new Date("2026-06-01T09:00:00Z"), new Date("2026-06-10T12:00:00Z")),
    ).toBe(9);
    expect(
      civilDaysBetween(new Date("2026-06-01T23:00:00Z"), new Date("2026-06-02T01:00:00Z")),
    ).toBe(0); // 02:00 → 04:00 the same Israeli morning
  });

  it("is a whole number across the Israeli DST flip (27.3.2026, 02:00 → 03:00)", () => {
    const before = new Date("2026-03-26T12:00:00Z");
    const after = new Date("2026-03-29T12:00:00Z");
    expect(civilDaysBetween(before, after)).toBe(3);
  });
});

describe("civilDaysUntilStored — the ONE exam countdown", () => {
  // An exam is stored date-only, at UTC midnight of its calendar day.
  const examOn = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("00:30 Israel on the exam morning → the exam is TODAY (0), not tomorrow", () => {
    // The bug this kills: bucketing `now` by UTC components made todayUTC = 14.8,
    // so a 15.8 exam read as "בעוד יום" and a 14.8 exam read as "היום" — the app
    // announced YESTERDAY's exam as today's, on the student's exam morning.
    expect(civilDaysUntilStored(examOn("2026-08-15"), JUST_AFTER_IL_MIDNIGHT)).toBe(0);
    expect(civilDaysUntilStored(examOn("2026-08-16"), JUST_AFTER_IL_MIDNIGHT)).toBe(1);
    // Yesterday's exam is PAST — it must fall out of every "upcoming" list.
    expect(civilDaysUntilStored(examOn("2026-08-14"), JUST_AFTER_IL_MIDNIGHT)).toBe(-1);
  });

  it("same, in winter (UTC+2) — the offset is resolved, never hardcoded", () => {
    expect(civilDaysUntilStored(examOn("2026-01-15"), JUST_AFTER_IL_MIDNIGHT_WINTER)).toBe(0);
    expect(civilDaysUntilStored(examOn("2026-01-14"), JUST_AFTER_IL_MIDNIGHT_WINTER)).toBe(-1);
  });

  it("late in the Israeli evening the exam is still TODAY, never already tomorrow", () => {
    // 2026-08-15T20:00Z = 23:00 Israel, still the 15th.
    expect(civilDaysUntilStored(examOn("2026-08-15"), new Date("2026-08-15T20:00:00Z"))).toBe(0);
  });

  it("accepts the ISO string form the API hands back", () => {
    expect(civilDaysUntilStored("2026-08-20T00:00:00.000Z", new Date("2026-08-14T12:00:00Z"))).toBe(6);
  });

  it("never fractionally rounds across the DST flip", () => {
    // 26.3 → 30.3.2026 spans the spring-forward night; a raw ms division gives
    // 3.958… days, which Math.ceil would inflate to 4 and Math.floor crush to 3.
    expect(civilDaysUntilStored(examOn("2026-03-30"), new Date("2026-03-26T10:00:00Z"))).toBe(4);
    expect(storedDateKeyMs(examOn("2026-03-30")) % 86_400_000).toBe(0);
  });
});
