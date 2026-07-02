import { describe, it, expect } from "vitest";
import { generateExamPlan, analyzeExamPeriod, classifyDifficulty, type ExamInput } from "@/lib/exam-planner";

const NOW = new Date("2026-06-01T00:00:00Z");

function exam(over: Partial<ExamInput>): ExamInput {
  return {
    courseCode: "0651-1007",
    courseName: "סטטיסטיקה",
    examDate: "2026-06-15T09:00:00Z",
    credits: 5,
    averageGrade: 78,
    failRate: 0.1,
    moed: "A",
    ...over,
  };
}

describe("exam-planner", () => {
  it("classifies difficulty from grade/fail-rate signals", () => {
    expect(classifyDifficulty(60, 0.05)).toBe("high");
    expect(classifyDifficulty(85, 0.3)).toBe("high");
    expect(classifyDifficulty(76, 0.1)).toBe("medium");
    expect(classifyDifficulty(null, null)).toBe("medium");
    // Known-easy course budgets fewer hours — "low" must be reachable.
    expect(classifyDifficulty(85, 0.05)).toBe("low");
    expect(classifyDifficulty(90, null)).toBe("low");
  });

  it("lays study sessions BEFORE the exam, never on/after it", () => {
    const { sessions } = generateExamPlan([exam({})], NOW);
    expect(sessions.length).toBeGreaterThan(0);
    const examDay = new Date("2026-06-15").setHours(0, 0, 0, 0);
    for (const s of sessions) {
      expect(s.date.getTime()).toBeLessThan(examDay);
      expect(s.date.getTime()).toBeGreaterThanOrEqual(new Date("2026-06-01").setHours(0, 0, 0, 0));
    }
  });

  it("budgets more hours for heavier/harder courses", () => {
    const easy = generateExamPlan([exam({ credits: 2, averageGrade: 90 })], NOW);
    const hard = generateExamPlan([exam({ credits: 6, averageGrade: 60 })], NOW);
    expect(hard.exams[0]!.totalHours).toBeGreaterThan(easy.exams[0]!.totalHours);
  });

  it("skips blocked/unavailable days (matched on LOCAL dates)", () => {
    const { sessions } = generateExamPlan([exam({})], NOW, ["2026-06-14"]);
    // Compare on local date parts — session dates are local midnights, and a
    // UTC (toISOString) comparison shifts a day for Israel and hides misses.
    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some((s) => localKey(s.date) === "2026-06-14")).toBe(false);
  });

  it("flags exams that are too close together", () => {
    const plan = generateExamPlan(
      [exam({ courseCode: "A", examDate: "2026-06-15" }), exam({ courseCode: "B", courseName: "מאקרו", examDate: "2026-06-16" })],
      NOW
    );
    const recs = analyzeExamPeriod(plan, true, NOW);
    expect(recs.some((r) => r.kind === "clash")).toBe(true);
  });

  it("recommends starting with the soonest exam", () => {
    const plan = generateExamPlan([exam({})], NOW);
    const recs = analyzeExamPeriod(plan, true, NOW);
    expect(recs[0]?.kind).toBe("start");
  });
});
