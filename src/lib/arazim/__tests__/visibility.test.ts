import { describe, it, expect } from "vitest";
import { ARAZIM_ENABLED, arazimView, arazimVisible } from "@/lib/arazim/visibility";
import { classifyDifficulty } from "@/lib/exam-planner";

// Locks the CURRENT state of the Arazim gate: owner decision "בלי ארזים כרגע"
// means ARAZIM_ENABLED is false, so every external grade/difficulty field reads
// as absent everywhere. If someone flips the flag back on, these expectations
// flip too — which is the intended, deliberate signal, not a silent regression.

const arazimCourse = {
  averageGrade: 82,
  medianGrade: 85,
  gradeStdDev: 7,
  failRate: 12,
  difficultyLevel: "hard",
  gradeDataYear: "2024b",
  gradeDataSource: "arazim",
};

describe("Arazim visibility gate", () => {
  it("is OFF right now (owner: בלי ארזים כרגע)", () => {
    expect(ARAZIM_ENABLED).toBe(false);
  });

  it("arazimVisible is false while the flag is off, even for arazim-sourced rows", () => {
    expect(arazimVisible(arazimCourse)).toBe(false);
    expect(arazimVisible({ gradeDataSource: null })).toBe(false);
  });

  it("arazimView nulls every external grade field while off", () => {
    const v = arazimView(arazimCourse);
    expect(v).toEqual({
      averageGrade: null,
      medianGrade: null,
      gradeStdDev: null,
      failRate: null,
      difficultyLevel: null,
      gradeDataYear: null,
    });
  });

  it("tolerates a partial course shape (missing gradeDataSource) without throwing", () => {
    expect(() => arazimView({ averageGrade: 90 })).not.toThrow();
    expect(arazimView({ averageGrade: 90 }).averageGrade).toBeNull();
  });

  it("classifyDifficulty falls back to 'medium' with Arazim off — no external signal", () => {
    // Numbers that would otherwise classify "high" (fail ≥ 20) still read medium.
    expect(classifyDifficulty(55, 40)).toBe("medium");
    expect(classifyDifficulty(95, 0)).toBe("medium");
  });
});
