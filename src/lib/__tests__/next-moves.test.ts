import { describe, it, expect } from "vitest";
import { nextMoves, type NextMovesInput } from "@/lib/next-moves";

// Each test here pins one of the three defects the audit found in the surfaces
// this file replaces. A green test that holds broken behaviour in place has
// happened in this repo before, so each one names the bug it is guarding.

const fresh: NextMovesInput = {
  courseCount: 0,
  gradedCount: 0,
  hasFocusArea: false,
  studyTaskCount: 0,
  advisorMessageCount: 0,
  calendarConnected: false,
  cohortContributions: 0,
  daysToBidding: null,
  daysToNearestExam: null,
};

const allDone: NextMovesInput = {
  courseCount: 12,
  gradedCount: 8,
  hasFocusArea: true,
  studyTaskCount: 5,
  advisorMessageCount: 4,
  calendarConnected: true,
  cohortContributions: 1,
  daysToBidding: null,
  daysToNearestExam: null,
};

describe("it can retire itself", () => {
  it("reports complete once every move is done", () => {
    // The card it replaces could not: hasCohortContribution was written as the
    // literal `false` at the call site, so tried === knowable was unreachable
    // and the panel sat on the dashboard forever.
    expect(nextMoves(allDone).complete).toBe(true);
    expect(nextMoves(fresh).complete).toBe(false);
  });
});

describe("the count counts the rows on screen", () => {
  it("counts every move, and every move is renderable", () => {
    // The old card summed `tried` over all entries and rendered slice(0, 5),
    // so it said "1/3" while one of the three was below the cut.
    const r = nextMoves({ ...fresh, courseCount: 3, gradedCount: 2 });
    expect(r.total).toBe(r.moves.length);
    expect(r.done).toBe(r.moves.filter((m) => m.done).length);
    expect(r.done).toBe(2);
  });
});

describe("every tick comes from a trace", () => {
  it("ticks the exam planner only once study tasks really exist", () => {
    const off = nextMoves(fresh).moves.find((m) => m.id === "examPlanner")!;
    const on = nextMoves({ ...fresh, studyTaskCount: 4 }).moves.find((m) => m.id === "examPlanner")!;
    expect(off.done).toBe(false);
    expect(on.done).toBe(true);
  });

  it("ticks the advisor only once messages exist, not on a visit", () => {
    expect(nextMoves(fresh).moves.find((m) => m.id === "advisor")!.done).toBe(false);
    expect(
      nextMoves({ ...fresh, advisorMessageCount: 1 }).moves.find((m) => m.id === "advisor")!.done,
    ).toBe(true);
  });
});

describe("the calendar orders it", () => {
  it("leads with the plan when the round is days away", () => {
    // /bidding builds its list from the saved plan (bidding-content.tsx:156),
    // so an unbuilt plan is precisely what the round is waiting on.
    expect(nextMoves({ ...fresh, daysToBidding: 5 }).moves[0]!.id).toBe("plan");
  });

  it("leads with the exam planner when the nearer date is an exam", () => {
    const r = nextMoves({ ...fresh, courseCount: 9, gradedCount: 4, daysToNearestExam: 11 });
    expect(r.moves[0]!.id).toBe("examPlanner");
  });

  it("puts the closer date first when both are live", () => {
    expect(nextMoves({ ...fresh, daysToBidding: 4, daysToNearestExam: 30 }).moves[0]!.id).toBe("plan");
    expect(
      nextMoves({ ...fresh, daysToBidding: 18, daysToNearestExam: 3 }).moves[0]!.id,
    ).toBe("examPlanner");
  });

  it("invents no urgency out of season", () => {
    const r = nextMoves({ ...fresh, daysToBidding: 90, daysToNearestExam: 200 });
    expect(r.moves.every((m) => m.dueInDays === undefined)).toBe(true);
  });

  it("never puts a finished move above an unfinished one", () => {
    const r = nextMoves({ ...fresh, courseCount: 9, calendarConnected: true });
    const lastUndone = r.moves.map((m) => m.done).lastIndexOf(false);
    const firstDone = r.moves.map((m) => m.done).indexOf(true);
    expect(firstDone).toBeGreaterThan(lastUndone);
  });
});

// -------------------------------------------------------------------------
// Every destination is a real route
// -------------------------------------------------------------------------
// The nudge that told a student "המכרז בעוד 8 ימים" pointed at /planner, which
// falls into a zero-courses branch and renders a "back to home" screen. The
// href was never wrong in the sense a type-checker could see — it was wrong in
// the sense that nobody arriving there found the thing they were promised.
// Seven rows, seven links, on the one card a new student is meant to follow.
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("every move points somewhere that exists", () => {
  it("has a page.tsx behind each href", () => {
    const { moves } = nextMoves(fresh);
    expect(moves).toHaveLength(7);
    for (const m of moves) {
      const route = m.href.replace(/^\//, "");
      const page = join(process.cwd(), "src/app/[locale]/(protected)", route, "page.tsx");
      expect(existsSync(page), `${m.id} → ${m.href}`).toBe(true);
    }
  });

  it("sends 'choose a focus area' to the screen that has the selector", () => {
    // /record shows the academic file; the focus-area control lives in
    // settings/profile-section.tsx. This was worth an explicit assertion
    // because the two screens are easy to confuse and only one can set it.
    const { moves } = nextMoves(fresh);
    expect(moves.find((m) => m.id === "focus")!.href).toBe("/settings");
    expect(moves.find((m) => m.id === "calendarSync")!.href).toBe("/settings");
  });
});
