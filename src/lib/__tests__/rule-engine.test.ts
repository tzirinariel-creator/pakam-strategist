import { describe, it, expect } from "vitest";
import { runRegulationEngine } from "@/lib/regulations/rule-engine";
import type { UserCourseWithCourse } from "@/types/degree";

/**
 * Minimal completed course fixture for the fields the engine + credit
 * calculator read. Cast through `unknown` to avoid filling every column.
 */
let seq = 0;
function course(over: {
  credits?: number;
  discipline?: string;
  courseType?: string;
  status?: string;
  grade?: number | null;
}): UserCourseWithCourse {
  seq += 1;
  return {
    id: `uc-${seq}`,
    status: over.status ?? "COMPLETED",
    grade: over.grade ?? 85,
    submissionType: null,
    submissionGrade: null,
    attemptNumber: 1,
    plannedYear: 1,
    disciplineOverride: null,
    course: {
      id: `c-${seq}`,
      code: `000${seq}`,
      nameHe: "קורס",
      nameEn: "Course",
      discipline: over.discipline ?? "ECONOMICS",
      courseType: over.courseType ?? "ELECTIVE",
      credits: over.credits ?? 3,
    },
  } as unknown as UserCourseWithCourse;
}

describe("runRegulationEngine — aggregation invariants", () => {
  const summary = runRegulationEngine([], null);

  it("produces one result per rule", () => {
    expect(summary.totalRules).toBe(summary.results.length);
    expect(summary.totalRules).toBeGreaterThan(0);
  });

  it("counts every result exactly once across passed/failed/warnings/info", () => {
    expect(summary.passed + summary.failed + summary.warnings + summary.info).toBe(
      summary.totalRules
    );
  });

  it("computes complianceScore as round(passed / total * 100), within 0–100", () => {
    expect(summary.complianceScore).toBe(
      Math.round((summary.passed / summary.totalRules) * 100)
    );
    expect(summary.complianceScore).toBeGreaterThanOrEqual(0);
    expect(summary.complianceScore).toBeLessThanOrEqual(100);
  });

  it("gives every rule a unique id and the required fields", () => {
    const ids = summary.results.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate rules
    for (const r of summary.results) {
      expect(typeof r.ruleId).toBe("string");
      expect(typeof r.passed).toBe("boolean");
      expect(["ERROR", "WARNING", "INFO"]).toContain(r.severity);
      expect(r.messageHe.length).toBeGreaterThan(0);
      expect(r.messageEn.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic for the same input", () => {
    const a = runRegulationEngine([], null);
    const b = runRegulationEngine([], null);
    expect(b.complianceScore).toBe(a.complianceScore);
    expect(b.passed).toBe(a.passed);
    expect(b.totalRules).toBe(a.totalRules);
  });
});

describe("runRegulationEngine — responds to course data", () => {
  it("flips the total-credits rule from failing to passing once 150 credits are completed", () => {
    const empty = runRegulationEngine([], null);
    const totalRuleEmpty = empty.results.find((r) => r.ruleId === "PKM-001");
    expect(totalRuleEmpty).toBeDefined();
    expect(totalRuleEmpty?.passed).toBe(false);

    // 10 completed courses × 15 credits = 150 total credits.
    const fullCredits = Array.from({ length: 10 }, () =>
      course({ credits: 15 })
    );
    const withCredits = runRegulationEngine(fullCredits, "ECONOMICS");
    const totalRuleFull = withCredits.results.find((r) => r.ruleId === "PKM-001");

    expect(totalRuleFull?.passed).toBe(true);
    // Satisfying a hard requirement cannot lower the compliance score.
    expect(withCredits.complianceScore).toBeGreaterThanOrEqual(
      empty.complianceScore
    );
  });
});
