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

  it("computes today's load exactly (nearest-first packing leaves today empty)", () => {
    // 5 credits, medium difficulty → 5 sessions of 2.5h packed onto the 5 days
    // nearest the exam (Jun 5-9). Today (Jun 1) gets nothing — pinned exactly
    // so a packing/grouping regression can't hide behind a >= 0 assertion.
    const plan = generateExamPlan([exam({ credits: 5 })], NOW);
    const m = buildSkylineModel(plan, NOW);
    expect(m.todayHours).toBe(0);
    expect(m.todayCourses).toBe(0);
    const studyDays = m.items.filter((i) => i.kind === "day" && i.bars.length > 0);
    expect(studyDays).toHaveLength(5);
    for (const d of studyDays) {
      if (d.kind === "day") expect(d.sumHours).toBe(2.5);
    }
    expect(m.maxDayHours).toBe(2.5);
  });
});
