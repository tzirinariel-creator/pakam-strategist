import { describe, it, expect } from "vitest";
import { generateExamPlan, type ExamInput } from "@/lib/exam-planner";
import { buildSkylineModel } from "@/components/exam-planner/study-skyline";

const NOW = new Date("2026-06-01T00:00:00Z");

function exam(over: Partial<ExamInput>): ExamInput {
  return {
    courseCode: "0651-1007",
    courseName: "סטטיסטיקה",
    examDate: "2026-06-10T09:00:00Z",
    credits: 5,
    averageGrade: 78,
    failRate: 0.1,
    moed: "A",
    ...over,
  };
}

describe("buildSkylineModel", () => {
  it("is empty when there are no exams", () => {
    const m = buildSkylineModel({ sessions: [], exams: [] }, NOW);
    expect(m.items).toHaveLength(0);
    expect(m.firstExam).toBeNull();
    expect(m.courses).toHaveLength(0);
  });

  it("builds a day axis with one exam anchor for a single exam", () => {
    const plan = generateExamPlan([exam({})], NOW);
    const m = buildSkylineModel(plan, NOW);
    expect(m.firstExam?.courseName).toBe("סטטיסטיקה");
    expect(m.courses).toHaveLength(1);
    expect(m.maxDayHours).toBeGreaterThanOrEqual(2.5);
    // exactly one calendar day carries the exam anchor
    const examDays = m.items.filter((i) => i.kind === "day" && i.exams.length > 0);
    expect(examDays).toHaveLength(1);
  });

  it("marks a clash when two exams are < 3 days apart", () => {
    const plan = generateExamPlan(
      [
        exam({ courseCode: "A", examDate: "2026-06-10" }),
        exam({ courseCode: "B", courseName: "מאקרו", examDate: "2026-06-11" }),
      ],
      NOW,
    );
    const m = buildSkylineModel(plan, NOW);
    expect(m.courses).toHaveLength(2);
    const clashed = m.items.some((i) => i.kind === "day" && i.exams.some((e) => e.isClash));
    expect(clashed).toBe(true);
  });

  it("collapses a long empty gap into a single rest segment", () => {
    // A soon exam, then one far enough that a ≥3-day empty stretch sits between
    // the first exam and the second's study window.
    const plan = generateExamPlan(
      [
        exam({ courseCode: "A", examDate: "2026-06-05", credits: 2 }),
        exam({ courseCode: "B", courseName: "מאקרו", examDate: "2026-07-04", credits: 3 }),
      ],
      NOW,
    );
    const m = buildSkylineModel(plan, NOW);
    expect(m.items.some((i) => i.kind === "rest")).toBe(true);
  });

  it("sums daily load exactly; crammer leaves today empty, steady reaches it", () => {
    // 5 credits, medium → a 13h budget. Crammer packs the days nearest the exam,
    // leaving today (Jun 1, ~2 weeks out) empty; the capacity-aware steady engine
    // spreads so today DOES get load. Values pinned so a summing/grouping
    // regression can't hide behind a >= 0 assertion.
    const crammer = buildSkylineModel(generateExamPlan([exam({ credits: 5 })], NOW, [], "crammer"), NOW);
    expect(crammer.todayHours).toBe(0);
    expect(crammer.todayCourses).toBe(0);
    const study = crammer.items.filter((i) => i.kind === "day" && i.bars.length > 0);
    // One course → no day exceeds the 2.5h per-subject daily max, and the total
    // equals the 13h budget (capacity is ample in the crammer window).
    for (const d of study) if (d.kind === "day") expect(d.sumHours).toBeLessThanOrEqual(2.5 + 1e-6);
    expect(crammer.maxDayHours).toBeLessThanOrEqual(2.5 + 1e-6);
    const total = study.reduce((s, d) => s + (d.kind === "day" ? d.sumHours : 0), 0);
    expect(Math.round(total * 10) / 10).toBe(13);
    // Steady spreads the same budget so today is no longer empty.
    const steady = buildSkylineModel(generateExamPlan([exam({ credits: 5 })], NOW, [], "steady"), NOW);
    expect(steady.todayHours).toBeGreaterThan(0);
  });
});
