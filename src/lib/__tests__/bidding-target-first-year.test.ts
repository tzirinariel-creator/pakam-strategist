// =========================================================================
// The bidding toolkit must point at the year the student is registering FOR
// =========================================================================
// Ariel, #29: "אתה חותם על מוכנות לבידינג? הבנת היטב איך הוא עובד? הוא יעזור
// גם לשנה א׳, גם לב׳ וגם לג׳? אין בו טעויות?"
//
// It did not help year 1, and that is the cohort registering for the first
// time — the one with the least idea what to do and the most to lose.
//
// getBiddingTarget derived the study year against getAcademicNow() and then
// added a manual +1. On 1.9.2026 the academic "now" is still תשפ״ו, because the
// תשפ״ז fall window opens 18.10 — while onboarding stores an incoming
// first-year with startYear 2026, the PLANNING anchor's year. So:
//
//     deriveYearOfStudy(2026, 1) → 2025 − 2026 + 1 = 0
//     Math.max(1, …) clamps "hasn't started yet" to 1
//     the manual +1 → 2
//
// For a student who started in 2025 or 2024 the two errors cancel exactly,
// which is why this survived every earlier pass: it is wrong for precisely the
// cohort it matters most for. Every consumer — the planner's bidding count, the
// year-at-a-glance card, the overlap alert, the worksheet — was handed year 2,
// where a first-year has no rows, so the whole toolkit reported they had
// planned nothing.

import { describe, it, expect } from "vitest";
import { getBiddingTarget } from "@/lib/bidding-target";
import { getPlanningAnchor } from "@/lib/academic-calendar";

// Six days before round 1 opens — the exact clock Ariel is testing on.
const NOW = new Date(2026, 8, 1);

describe("an incoming first-year registers for YEAR 1", () => {
  it("returns year 1 for a student whose degree starts this coming year", () => {
    const t = getBiddingTarget(2026, 1, NOW);
    expect(t?.yearOfStudy).toBe(1);
  });

  it("the witness: the old derivation produced year 2", () => {
    // deriveYearOfStudy against the CURRENT academic year, then +1.
    const academicStartYear = 2025; // תשפ״ו on 1.9.2026
    const clamped = Math.max(1, academicStartYear - 2026 + 1); // → 1
    expect(clamped + 1).toBe(2);
  });

  it("agrees with the anchor /bidding itself reads", () => {
    // The two screens used to disagree by construction; now they cannot.
    const anchor = getPlanningAnchor(NOW);
    expect(getBiddingTarget(2026, 1, NOW)?.semester).toBe(anchor.semester);
  });
});

describe("the years that used to work still work", () => {
  it("a 2025-start student registers for year 2", () => {
    expect(getBiddingTarget(2025, 1, NOW)?.yearOfStudy).toBe(2);
  });

  it("a 2024-start student registers for year 3", () => {
    expect(getBiddingTarget(2024, 2, NOW)?.yearOfStudy).toBe(3);
  });

  it("a student past year 3 has nothing left to register for", () => {
    // The silence that keeps the whole surface off a finishing student's home
    // screen must survive the change.
    expect(getBiddingTarget(2023, 3, NOW)).toBeNull();
  });
});

describe("an account with no startYear is still bounded by the degree", () => {
  // Older accounts stored only a year. The first version of this fix tested
  // "past the degree" on `startYear`, so those students fell through the guard
  // entirely and would have been handed a bidding surface for a year they have
  // nothing left to register for. Two tests caught it — this is the second.
  it("a stored third-year heading into a new academic year gets nothing", () => {
    expect(getBiddingTarget(null, 3, NOW)).toBeNull();
  });

  it("a stored second-year still gets year 3", () => {
    expect(getBiddingTarget(null, 2, NOW)?.yearOfStudy).toBe(3);
  });

  it("a stored first-year still gets year 2", () => {
    expect(getBiddingTarget(null, 1, NOW)?.yearOfStudy).toBe(2);
  });
});

describe("the round it aims at", () => {
  it("is the coming FALL, six days before round 1", () => {
    expect(getBiddingTarget(2026, 1, NOW)?.semester).toBe("FALL");
  });

  it("never reports a year outside the degree", () => {
    for (const start of [2026, 2025, 2024]) {
      const t = getBiddingTarget(start, 1, NOW);
      if (t) expect(t.yearOfStudy).toBeGreaterThanOrEqual(1);
      if (t) expect(t.yearOfStudy).toBeLessThanOrEqual(3);
    }
  });
});
