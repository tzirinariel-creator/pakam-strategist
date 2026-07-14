import { describe, it, expect } from "vitest";
import { reachedMilestones } from "@/lib/milestones";

// Wave-4 honest gamification: milestones fire ONLY on real derivable
// thresholds, largest credit tier first, no invented numbers.
const base = { totalCredits: 150, gradedCount: 0, englishExempt: false, gender: null } as const;

describe("reachedMilestones", () => {
  it("fresh student — nothing reached, nothing shown", () => {
    expect(reachedMilestones({ ...base, earnedCredits: 0 })).toEqual([]);
  });

  it("below the first threshold stays silent (no participation trophies)", () => {
    expect(reachedMilestones({ ...base, earnedCredits: 30 })).toEqual([]);
  });

  it("crossing 25% fires exactly the quarter milestone with the REAL numbers", () => {
    const ms = reachedMilestones({ ...base, earnedCredits: 40 });
    expect(ms.map((m) => m.id)).toEqual(["credits-25"]);
    expect(ms[0]!.textHe).toContain("40");
    expect(ms[0]!.textHe).toContain("150");
  });

  it("only the LARGEST credit tier fires — no backlog of smaller ones", () => {
    const ms = reachedMilestones({ ...base, earnedCredits: 77 });
    expect(ms.map((m) => m.id)).toEqual(["credits-50"]);
  });

  it("75% wins over 50/25", () => {
    const ms = reachedMilestones({ ...base, earnedCredits: 120 });
    expect(ms.map((m) => m.id)).toEqual(["credits-75"]);
  });

  it("first grade fires at exactly ONE graded course (a moment, not a counter)", () => {
    expect(reachedMilestones({ ...base, earnedCredits: 0, gradedCount: 1 }).map((m) => m.id)).toEqual(["first-grade"]);
    expect(reachedMilestones({ ...base, earnedCredits: 0, gradedCount: 5 })).toEqual([]);
  });

  it("English exemption is its own milestone, alongside a credit tier", () => {
    const ms = reachedMilestones({ ...base, earnedCredits: 77, englishExempt: true });
    expect(ms.map((m) => m.id)).toEqual(["credits-50", "english-exempt"]);
  });

  it("zero denominator → empty (never divides by zero)", () => {
    expect(reachedMilestones({ ...base, totalCredits: 0, earnedCredits: 10 })).toEqual([]);
  });
});
