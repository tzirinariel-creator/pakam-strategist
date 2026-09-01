// =========================================================================
// A deadline outranks a task that has none
// =========================================================================
// Ariel, 22-20: "בוא נהיה קוהרנטיים לזמן — אם הבידינג קרוב אז בוא נראה שיש
// הרבה מקום לבידינג."
//
// Measured on the live home screen on 1.9.2026, six days before round 1 opens
// and fourteen before it closes. The hero read "הציונים מתחילים להתפרסם" and
// the round was a slide in a 1-of-3 carousel further down the page.
//
// Entering grades has no deadline: do it next week and nothing is lost.
// Missing the round costs a student their courses for the year. So the ladder
// was upside down for exactly the fortnight it mattered.
//
// The fix is NOT a swap. Grades are a PREREQUISITE for registration — what you
// passed decides what you register for — so registration takes the rung and
// carries the grades ask with it, and the hero prints both. What follows pins
// both halves: the order, and the fact that nothing was dropped.

import { describe, it, expect } from "vitest";
import { getTimeFocus } from "@/lib/time-focus";

// Israel time, matching bidding-calendar.ts.
const il = (y: number, m: number, d: number, h = 12) =>
  new Date(Date.UTC(y, m - 1, d, h - 3, 0));

// A second-year who started in 2025 — has something left to register for.
const base = { startYear: 2025, storedYear: 2, daysToNearestExam: null };

describe("an imminent bidding round outranks pending grades", () => {
  it("leads with registration six days out, not with grades", () => {
    // The exact case on screen: 1.9.26, round 1 opens 7.9.
    const f = getTimeFocus({ ...base, gradesPending: true, now: il(2026, 9, 1) });
    expect(f?.kind).toBe("bidding");
    expect(f?.href).toBe("/bidding");
  });

  it("does NOT drop the grades ask when it takes the rung", () => {
    // The half that makes this a re-ordering rather than a deletion.
    const f = getTimeFocus({ ...base, gradesPending: true, now: il(2026, 9, 1) });
    expect(f?.gradesAlsoPending).toBe(true);
  });

  it("leads with registration while the round is actually open", () => {
    const f = getTimeFocus({ ...base, gradesPending: true, now: il(2026, 9, 10) });
    expect(f?.kind).toBe("bidding");
    expect(f?.bidding?.kind).toBe("open");
  });

  it("still leads with grades six WEEKS out", () => {
    // The guard on the other side. A countdown 40 days away is not more
    // urgent than grades arriving today, and if this ever flips, the home
    // screen starts shouting about registration for a month and a half.
    const f = getTimeFocus({ ...base, gradesPending: true, now: il(2026, 8, 1) });
    expect(f?.kind).toBe("grades");
  });

  it("still leads with grades when nothing is left to register for", () => {
    // Past year 3 there is no next registration; the ask must stay silent
    // whichever rung it would have taken.
    // startYear overrides storedYear in deriveYearOfStudy, so a third-year
    // is expressed by dropping the anchor — not by inflating storedYear.
    const f = getTimeFocus({
      ...base, startYear: null, storedYear: 3, gradesPending: true, now: il(2026, 9, 1),
    });
    expect(f?.kind).toBe("grades");
  });

  it("an exam in three days still beats everything", () => {
    // The top rung is unchanged: nothing about registration should displace
    // a sitting the student has this week.
    const f = getTimeFocus({
      ...base, daysToNearestExam: 3, gradesPending: true, now: il(2026, 9, 1),
    });
    expect(f?.kind).toBe("exams");
  });

  it("marks nothing when grades are not pending", () => {
    const f = getTimeFocus({ ...base, gradesPending: false, now: il(2026, 9, 1) });
    expect(f?.kind).toBe("bidding");
    expect(f?.gradesAlsoPending).toBe(false);
  });
});
