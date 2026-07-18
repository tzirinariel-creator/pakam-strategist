// @vitest-environment jsdom
// =========================================================================
// Locks the "NEVER predict points" honesty contract of the bidding worksheet
// (the domain guardrail: TAU's מכרז quota is unpublished — a fabricated
// recommendation would cost students seats, so the tool does ARITHMETIC ONLY).
// checkAllocations() runs for real (its own numbers are lib-tested); this file
// pins the UI wiring around it:
//   1. over-allocation warning fires EXACTLY when sum(allocations) > pool
//      (and NOT at the equality boundary — the meter never cries wolf),
//   2. the MIN_BID=5 floor note appears for a sub-floor (below-5) allocation,
//   3. the tips list is mechanism-only — it forecasts NO point outcome
//      (no "you'll win / usually the cutoff is N" phrasing, no stray number
//      beyond the fixed tie-break illustration).
// =========================================================================
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { MIN_BID } from "@/lib/bidding-worksheet";
import type { UserCourseWithCourse } from "@/types/degree";

// next-intl: Hebrew locale (isHe === true drives the copy under test).
vi.mock("next-intl", () => ({ useLocale: () => "he" }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The course catalog the worksheet looks names/codes up in. Two courses with
// no schedule sessions → detectAllConflicts([]) === [] → no clash flags to
// muddy the arithmetic assertions.
const h = vi.hoisted(() => ({
  courses: [
    { id: "c1", code: "0618-1000", nameHe: "מבוא לכלכלה", nameEn: "Intro to Economics", scheduleSessions: [] },
    { id: "c2", code: "0618-2000", nameHe: "מבוא למדע המדינה", nameEn: "Intro to Political Science", scheduleSessions: [] },
  ],
}));

vi.mock("@/lib/trpc/react", () => ({
  api: {
    course: { list: { useQuery: () => ({ data: h.courses }) } },
    user: { getProfile: { useQuery: () => ({ data: undefined }) } },
  },
}));

import { BiddingWorksheet } from "@/components/planner/bidding-worksheet";

// The student's planned courses for the BIDDING semester (targetYear/Semester).
const USER_COURSES = [
  { id: "uc1", courseId: "c1", plannedYear: 2026, plannedSemester: "FALL" },
  { id: "uc2", courseId: "c2", plannedYear: 2026, plannedSemester: "FALL" },
] as unknown as UserCourseWithCourse[];

// Per-course number inputs are aria-labelled `נקודות ל<courseName>`.
const LABEL_C1 = "נקודות למבוא לכלכלה";
const LABEL_C2 = "נקודות למבוא למדע המדינה";

/** Render and expand the collapsed worksheet (it opens on the header click). */
function openWorksheet() {
  render(<BiddingWorksheet courses={USER_COURSES} targetYear={2026} targetSemester="FALL" />);
  fireEvent.click(screen.getByRole("button", { name: /גיליון בידינג/ }));
}

const setValue = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("BiddingWorksheet — honesty contract + arithmetic guard", () => {
  it("over-allocation warning fires EXACTLY when sum(allocations) > pool", () => {
    openWorksheet();
    const pool = screen.getByLabelText(/כמה נקודות יש לכם/);
    setValue(pool, "10");
    const c1 = screen.getByLabelText(LABEL_C1);
    const c2 = screen.getByLabelText(LABEL_C2);

    // total 10 === pool → the equality boundary is NOT an over-allocation.
    setValue(c1, "5");
    setValue(c2, "5");
    expect(screen.queryByText(/תורידו ממשהו/)).not.toBeInTheDocument();

    // total 11 > 10 → warning fires, echoing the student's OWN arithmetic
    // (their entered total and their entered pool — never an invented number).
    setValue(c2, "6");
    expect(screen.getByText(/תורידו ממשהו/)).toBeInTheDocument();
    expect(screen.getByText(/חילקתם 11 .* רק 10/)).toBeInTheDocument();

    // pull one bid back to blank → total 6 ≤ 10 → warning clears.
    setValue(c2, "");
    expect(screen.queryByText(/תורידו ממשהו/)).not.toBeInTheDocument();
  });

  it("shows the MIN_BID=5 floor note for a sub-floor allocation, not for a valid one", () => {
    expect(MIN_BID).toBe(5);
    openWorksheet();
    const c1 = screen.getByLabelText(LABEL_C1);
    const floorNote = new RegExp(`מתחת ל-${MIN_BID} נקודות`);

    // exactly at the floor (5) → allowed, no note.
    setValue(c1, "5");
    expect(screen.queryByText(floorNote)).not.toBeInTheDocument();

    // below the floor (3) → the "can't enter the auction" note appears.
    setValue(c1, "3");
    expect(screen.getByText(floorNote)).toBeInTheDocument();
  });

  it("tips list is mechanism-only — no predicted point outcome", () => {
    openWorksheet();

    // Framed as mechanics, and the explicit quota-honesty disclaimer is present.
    expect(screen.getByText(/מנגנון, לא ניחוש/)).toBeInTheDocument();
    const disclaimer = screen.getByText(/לא יודעים את המכסה/);
    expect(disclaimer).toBeInTheDocument();

    const tips = disclaimer.closest("ul");
    expect(tips).not.toBeNull();
    const text = tips?.textContent ?? "";

    // No phrasing that forecasts an outcome ("expected/usually the cutoff",
    // "you'll win", "you'll get", "bidding N is recommended", "likely that…").
    const FORECAST_PHRASES = [
      /צפוי/,
      /בדרך כלל/,
      /לרוב/,
      /תזכ/,
      /יזכ/,
      /תקבל/,
      /יספיק/,
      /כדאי להמר/,
      /מומלץ להמר/,
      /סביר ש/,
      /הסף יהיה/,
      /הסף הוא/,
    ];
    for (const re of FORECAST_PHRASES) expect(text).not.toMatch(re);

    // No forecast NUMBER either: the only digits allowed here are the fixed
    // tie-break illustration (41 beats 40) and the round label (round 2) —
    // never a course-specific "bid N points to win" prediction.
    const nums = text.match(/\d+/g) ?? [];
    const ALLOWED = new Set(["40", "41", "2"]);
    for (const n of nums) expect(ALLOWED.has(n)).toBe(true);
  });
});
