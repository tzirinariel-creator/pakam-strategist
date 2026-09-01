// =========================================================================
// 13.8 — "אני באפליקציה כבר די הרבה זמן והוא עוד לא דיבר איתי מילה על הבידינג".
//
// The home screen's registration ask used to key off "≤45 days to the next
// TEACHING start". These tests pin the actual regression that produced Ariel's
// complaint (mid-August 2026, round 1 three weeks out, home screen silent) and
// the mirror-image bug (the window still claiming "bidding is near" after the
// rounds have closed), and they pin the off-season silence so the fix can't
// turn into a year-round nag.
// =========================================================================

import { describe, it, expect } from "vitest";
import { getTimeFocus } from "@/lib/time-focus";
import { BIDDING_ROUNDS_5787 } from "@/lib/bidding-calendar";

/** Israel-local instant, matching bidding-calendar's own `il` helper. */
const il = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h - 3, min));

/** A year-1 student with nothing else competing for the hero. */
const student = (now: Date) =>
  getTimeFocus({
    daysToNearestExam: null,
    gradesPending: false,
    startYear: 2026,
    storedYear: 1,
    now,
  });

const R1 = BIDDING_ROUNDS_5787[0]!;
const R2 = BIDDING_ROUNDS_5787[1]!;

describe("getTimeFocus — registration is driven by the PUBLISHED round dates", () => {
  it("THE REGRESSION: mid-August, with round 1 open in 25 days, home talks about bidding", () => {
    // 13.8.2026 — the day Ariel walked the app. Teaching starts 18.10.26 (66
    // days out), so the old ≤45-days-to-teaching window was still shut, and the
    // hero fell through to a generic "a good time to plan ahead".
    const focus = student(il(2026, 8, 13));
    expect(focus?.kind).toBe("bidding");
    expect(focus?.bidding?.kind).toBe("before");
    expect(focus?.bidding?.round).toBe(1);
    expect(focus?.days).toBe(25);
    // Ariel clicked this link and landed on a section inside /planner that
    // "לא באמת עובד". There is a dedicated screen now.
    expect(focus?.href).toBe("/bidding");
  });

  it("names the live round while it is open, counting to its CLOSE", () => {
    const focus = student(il(2026, 9, 10));
    expect(focus?.kind).toBe("bidding");
    expect(focus?.bidding?.kind).toBe("open");
    expect(focus?.bidding?.round).toBe(1);
    // closes 15.9 → five civil days
    expect(focus?.days).toBe(5);
  });

  it("switches to awaiting-results between a round's close and its results", () => {
    const focus = student(new Date(R1.closes.getTime() + 3600_000));
    expect(focus?.bidding?.kind).toBe("awaiting-results");
    expect(focus?.bidding?.round).toBe(1);
  });

  it("points at round 2 during the cancellation window between the rounds", () => {
    const focus = student(il(2026, 9, 20));
    expect(focus?.bidding?.kind).toBe("between-rounds");
    expect(focus?.bidding?.round).toBe(2);
  });

  it("goes quiet once round 2's results are out — the teaching-start proxy must not resurrect it", () => {
    // 10.10.26: rounds finished (results 6.10) but teaching is 8 days away, so
    // the old ≤45-day window was wide open and would have kept saying
    // "the bidding is near" for a round that had already closed.
    const focus = student(new Date(R2.results.getTime() + 4 * 86_400_000));
    expect(focus?.kind).not.toBe("bidding");
  });

  it("stays silent off-season instead of counting down from July", () => {
    // 1.7.2026 — 68 days to round 1. isBiddingRelevant caps prep talk at 45.
    const focus = student(il(2026, 7, 1));
    expect(focus?.kind).not.toBe("bidding");
  });

  it("says nothing to a student with no semester left to register for", () => {
    // Started תשפ״ד (2023) → year 3 in תשפ״ו, so the coming FALL would be a
    // year 4 that PPE doesn't have. getBiddingTarget returns null and the whole
    // registration branch must stay shut, published dates or not.
    const focus = getTimeFocus({
      daysToNearestExam: null,
      gradesPending: false,
      startYear: 2023,
      storedYear: 3,
      now: il(2026, 8, 13),
    });
    expect(focus?.kind).not.toBe("bidding");
  });

  it("a near exam still outranks registration — the ladder order is unchanged", () => {
    const focus = getTimeFocus({
      daysToNearestExam: 4,
      gradesPending: false,
      startYear: 2026,
      storedYear: 1,
      now: il(2026, 9, 10),
    });
    expect(focus?.kind).toBe("exams");
  });

  it("never carries a points prediction — only phase, round and a date-derived countdown", () => {
    // An ALLOWLIST, deliberately. Asserting the exact key set is what makes
    // this a guard on the iron rule rather than a spot-check: any new field
    // has to be justified here in writing before it can ship.
    //
    // `gradesAlsoPending` was added when an imminent round took the top rung
    // from pending grades (22-20). It is a boolean about the student's OWN
    // ungraded courses — it says nothing about how many points a course will
    // cost, which is the thing this test exists to keep out.
    const focus = student(il(2026, 9, 10));
    expect(Object.keys(focus ?? {}).sort()).toEqual([
      "bidding", "days", "gradesAlsoPending", "href", "kind",
    ]);
    // And the guard stated directly, so it survives the next field too.
    const serialised = JSON.stringify(focus);
    expect(serialised).not.toMatch(/points|נקודות|score|predict/i);
  });
});
