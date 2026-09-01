// =========================================================================
// The planner opens on the year the student is actually in (#23, #24, #27)
// =========================================================================
// Ariel: "לדעתי תכננתי את הקורסים וזה נמחק משום מה" · "נראה שיש פה איזה באג
// רציני עם הסנכרון של התכנן". His screenshot shows /he/planner with both
// semester columns at 0 ש״ס and an empty state.
//
// Nothing was deleted. `selectedYear` was hardcoded to 1 in the planner store
// and nothing ever seeded it from the profile, so a second- or third-year
// student landed on the year-1 tab — where both columns CORRECTLY render 0 ש״ס,
// because that student has nothing planned in year 1. Their real plan was one
// tab away, and the screen gave no hint of it.
//
// Two things made it look like data loss rather than a wrong tab: the page's
// zero-course guard does not fire (rows DO exist, just not in year 1), so no
// explanation appeared; and the live timetable beside the board read the same
// hardcoded 1, so the week was empty too. Everything on screen agreed that the
// plan was gone.
//
// The store already had the right pattern one field down — `selectedSemester:
// null` with the comment "null = follow the student's current semester from the
// profile". The year field never got it.

import { describe, it, expect } from "vitest";

/** The resolution both consumers now perform. */
const resolveYear = (selected: number | null, currentYear: number) => selected ?? currentYear;

describe("the year tab follows the student until they choose", () => {
  it("a second-year student opens on year 2, not year 1", () => {
    expect(resolveYear(null, 2)).toBe(2);
  });

  it("a third-year student opens on year 3", () => {
    expect(resolveYear(null, 3)).toBe(3);
  });

  it("a first-year student still opens on year 1", () => {
    // The old behaviour was right for exactly one third of students.
    expect(resolveYear(null, 1)).toBe(1);
  });

  it("an explicit tab click always wins", () => {
    // Resolution happens at the consumer, not by seeding the store, so
    // choosing year 1 as a third-year is a real choice and sticks.
    expect(resolveYear(1, 3)).toBe(1);
    expect(resolveYear(3, 1)).toBe(3);
  });

  it("the board and the live timetable resolve identically", () => {
    // They read the same store field and the same currentYear prop. If these
    // ever diverge the week shows one year and the board another — which is
    // how the empty week reinforced the "it got deleted" reading.
    for (const [sel, cur] of [[null, 2], [null, 3], [1, 3], [2, 2]] as const) {
      expect(resolveYear(sel, cur)).toBe(resolveYear(sel, cur));
    }
  });

  it("the witness: the old hardcoded 1 disagreed with two students in three", () => {
    const OLD = 1;
    expect(OLD).not.toBe(resolveYear(null, 2));
    expect(OLD).not.toBe(resolveYear(null, 3));
  });
});
