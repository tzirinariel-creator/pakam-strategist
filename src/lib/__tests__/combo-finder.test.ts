// P2 — the combination finder: solvable / unsolvable / already-fine, exactly
// per the acceptance criteria, plus the cap behavior.

import { describe, it, expect } from "vitest";
import { findBestCombination, type ComboCourse } from "@/lib/combo-finder";

const s = (sessionType: string, groupCode: string, dayOfWeek: string, startTime: string, endTime: string) => ({
  sessionType, groupCode, dayOfWeek, startTime, endTime,
});

describe("findBestCombination", () => {
  it("solvable: picks the alternative group that clears the clash", () => {
    const courses: ComboCourse[] = [
      // Fixed lecture MON 10-12.
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      // Tutorial group 30 clashes with A's lecture; group 31 is clear.
      {
        code: "B",
        sessions: [
          s("tutorial", "30", "MON", "10:00", "11:00"),
          s("tutorial", "31", "TUE", "14:00", "15:00"),
        ],
      },
    ];
    const r = findBestCombination(courses)!;
    expect(r.conflicts).toBe(0);
    expect(r.selections["B"]!["tutorial"]).toBe("31");
    expect(r.capped).toBe(false);
  });

  it("unsolvable: returns the least-bad combination and says so honestly", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      // BOTH tutorial options clash with A — but group 31 also clashes with C,
      // so 30 (one clash) must win over 31 (two clashes).
      {
        code: "B",
        sessions: [
          s("tutorial", "30", "MON", "11:00", "12:00"),
          s("tutorial", "31", "MON", "10:00", "11:00"),
        ],
      },
      { code: "C", sessions: [s("lecture", "01", "MON", "10:00", "11:00")] },
    ];
    const r = findBestCombination(courses)!;
    expect(r.conflicts).toBeGreaterThan(0); // honest: no clean combo exists
    expect(r.selections["B"]!["tutorial"]).toBe("30");
  });

  it("already-fine: keeps a zero-conflict pick and prefers fewer campus days", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      // Both options are clash-free; MON packs the week into one day (fewer
      // daysOnCampus → wins the ×10 term) vs. opening a new day on WED.
      {
        code: "B",
        sessions: [
          s("tutorial", "30", "MON", "13:00", "14:00"),
          s("tutorial", "31", "WED", "09:00", "10:00"),
        ],
      },
    ];
    const r = findBestCombination(courses)!;
    expect(r.conflicts).toBe(0);
    expect(r.selections["B"]!["tutorial"]).toBe("30");
    expect(r.daysOnCampus).toBe(1);
  });

  it("returns null when no course offers a choice (nothing to optimize)", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
    ];
    expect(findBestCombination(courses)).toBeNull();
  });

  it("respects the exploration cap and flags it", () => {
    // 8 courses × 4 options = 65536 combos > cap 100.
    const courses: ComboCourse[] = Array.from({ length: 8 }, (_, i) => ({
      code: `C${i}`,
      sessions: ["30", "31", "32", "33"].map((g, gi) =>
        s("tutorial", g, ["MON", "TUE", "WED", "THU"][gi]!, `${9 + i}:00`, `${10 + i}:00`),
      ),
    }));
    const r = findBestCombination(courses, 100)!;
    expect(r.capped).toBe(true);
    expect(r.explored).toBeLessThanOrEqual(100);
    expect(r.selections).toBeTruthy(); // still returns its best-so-far
  });
});

// =========================================================================
// #8 — "שאלון → מערכת", answered deterministically
// =========================================================================
// Ariel's note asked for a questionnaire that builds a timetable, and attached
// his own condition: "ללכת על זה רק אם יעבוד ממש טוב". So this is not a model
// composing a week and hoping. It is the same exhaustive search, given the two
// things a student can state exactly about their own life — days they need
// clear, and hours they can't be on campus — and it reports which of those
// wishes the winning combination actually keeps.
//
// The load-bearing test is the third one. A preference is a wish; an overlap is
// a fact. If a wish could ever outrank a clash, the feature would hand students
// broken weeks — which is precisely the "רק אם יעבוד ממש טוב" failure.
describe("findBestCombination — stated preferences (#8)", () => {
  it("keeps a requested day clear when a group choice allows it", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "TUE", "10:00", "12:00"),
          s("tutorial", "02", "WED", "10:00", "12:00"),
        ],
      },
    ];
    const plain = findBestCombination(courses)!;
    const withPref = findBestCombination(courses, 10_000, { freeDays: ["TUE"] })!;
    expect(withPref.selections.B!.tutorial).toBe("02");
    expect(withPref.honored!.freeDaysKept).toEqual(["TUE"]);
    expect(withPref.honored!.freeDaysBroken).toEqual([]);
    // Neither version invents a clash to get there.
    expect(plain.conflicts).toBe(0);
    expect(withPref.conflicts).toBe(0);
  });

  it("says plainly when a requested day could NOT be kept clear", () => {
    // Every group of B runs on TUE — the wish is impossible, and the result
    // must admit it rather than quietly reporting success.
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "TUE", "10:00", "12:00"),
          s("tutorial", "02", "TUE", "14:00", "16:00"),
        ],
      },
    ];
    const r = findBestCombination(courses, 10_000, { freeDays: ["TUE"] })!;
    expect(r.honored!.freeDaysKept).toEqual([]);
    expect(r.honored!.freeDaysBroken).toEqual(["TUE"]);
  });

  it("NEVER trades a real clash for a free day", () => {
    // Group 01 keeps TUE clear but collides head-on with A's fixed lecture.
    // Group 02 breaks the wish and is clean. The clean week must win.
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "MON", "10:00", "12:00"), // clashes with A
          s("tutorial", "02", "TUE", "10:00", "12:00"), // breaks the wish
        ],
      },
    ];
    const r = findBestCombination(courses, 10_000, { freeDays: ["TUE"] })!;
    expect(r.selections.B!.tutorial).toBe("02");
    expect(r.conflicts).toBe(0);
    expect(r.honored!.freeDaysBroken).toEqual(["TUE"]);
  });

  it("avoids early sessions when the student can't be there before 10", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "14:00", "16:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "TUE", "08:00", "10:00"),
          s("tutorial", "02", "TUE", "12:00", "14:00"),
        ],
      },
    ];
    const r = findBestCombination(courses, 10_000, { earliestHour: 10 })!;
    expect(r.selections.B!.tutorial).toBe("02");
    expect(r.honored!.outOfHoursSessions).toBe(0);
  });

  it("avoids late sessions when the student has to leave by 16", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "TUE", "18:00", "20:00"),
          s("tutorial", "02", "TUE", "12:00", "14:00"),
        ],
      },
    ];
    const r = findBestCombination(courses, 10_000, { latestHour: 16 })!;
    expect(r.selections.B!.tutorial).toBe("02");
    expect(r.honored!.outOfHoursSessions).toBe(0);
  });

  it("counts the sessions it could not fit inside the requested hours", () => {
    // A's lecture is FIXED at 08:00 — no combination can move it. The number
    // has to come back as 1, not as a silent success.
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "08:00", "10:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "TUE", "08:00", "10:00"),
          s("tutorial", "02", "TUE", "12:00", "14:00"),
        ],
      },
    ];
    const r = findBestCombination(courses, 10_000, { earliestHour: 10 })!;
    expect(r.honored!.outOfHoursSessions).toBe(1);
  });

  it("with no preferences, behaves exactly as before and reports honored=null", () => {
    const courses: ComboCourse[] = [
      { code: "A", sessions: [s("lecture", "01", "MON", "10:00", "12:00")] },
      {
        code: "B",
        sessions: [
          s("tutorial", "01", "MON", "10:00", "12:00"),
          s("tutorial", "02", "TUE", "10:00", "12:00"),
        ],
      },
    ];
    const before = findBestCombination(courses)!;
    const empty = findBestCombination(courses, 10_000, {})!;
    expect(before.honored).toBeNull();
    expect(empty.selections).toEqual(before.selections);
    expect(empty.conflicts).toBe(before.conflicts);
  });
});
