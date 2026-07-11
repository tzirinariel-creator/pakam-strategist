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
