import { describe, it, expect } from "vitest";
import { buildExamPeriodBlock } from "@/lib/ai/exam-facts";
import type { StudyTaskLike } from "@/lib/plan-from-tasks";

const NOW = new Date(2026, 0, 10); // Jan 10 2026

const exam = (day: number, code: string, title: string): StudyTaskLike => ({
  taskType: "exam",
  startDate: new Date(2026, 0, day),
  notes: "[auto] difficulty:medium",
  courseCode: code,
  title,
  color: "#6366f1",
});
const study = (day: number, code: string, hours: number): StudyTaskLike => ({
  taskType: "study",
  startDate: new Date(2026, 0, day),
  notes: `[auto] ${hours}h`,
  courseCode: code,
  title: `לימוד: קורס ${code}`,
  color: "#6366f1",
});

describe("buildExamPeriodBlock", () => {
  it("null with no tasks or only past exams", () => {
    expect(buildExamPeriodBlock([], NOW)).toBeNull();
    expect(buildExamPeriodBlock([exam(5, "0651-1007", "מבחן: מתמטיקה לפכ\"מ")], NOW)).toBeNull();
  });

  it("lists upcoming exams with dates, moed and session count", () => {
    const block = buildExamPeriodBlock(
      [
        exam(20, "0651-1007", "מבחן: מתמטיקה לפכ\"מ"),
        study(15, "0651-1007", 2.5),
        study(17, "0651-1007", 2.5),
      ],
      NOW,
    );
    expect(block).toBeTruthy();
    expect(block).toContain("מתמטיקה");
    expect(block).toContain("20.1");
    expect(block).toContain("מועד א׳");
    expect(block).toContain("מפגשי-לימוד מתוכננים: 2");
  });

  it("peak day sums same-day sessions", () => {
    const block = buildExamPeriodBlock(
      [
        exam(20, "0651-1007", "מבחן: מתמטיקה לפכ\"מ"),
        study(15, "0651-1007", 2.5),
        study(15, "0651-1007", 3),
      ],
      NOW,
    )!;
    expect(block).toContain("היום העמוס ביותר: 15.1 (5.5 שעות)");
  });
});
