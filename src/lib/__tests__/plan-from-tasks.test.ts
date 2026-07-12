import { describe, it, expect } from "vitest";
import { generateExamPlan, analyzeExamPeriod, type ExamInput } from "@/lib/exam-planner";
import { planFromStudyTasks, type StudyTaskLike } from "@/lib/plan-from-tasks";

const NOW = new Date("2026-06-01T00:00:00");

/** Serialize a plan EXACTLY like study-task.ts persists it (noon exam stamp,
 *  09:00 sessions, "[auto]" notes) — so this test locks the full round-trip. */
function persistShape(plan: ReturnType<typeof generateExamPlan>): StudyTaskLike[] {
  const rows: StudyTaskLike[] = [];
  for (const ex of plan.exams) {
    const examAt = new Date(ex.examDate);
    examAt.setHours(12, 0, 0, 0);
    rows.push({
      taskType: "exam",
      startDate: examAt,
      title: `מבחן: ${ex.courseName} (מועד ${ex.moed === "B" ? "ב׳" : "א׳"})`,
      courseCode: ex.courseCode,
      color: ex.color,
      notes: `[auto] ${ex.difficulty} budget=${ex.totalHours}`,
    });
  }
  for (const s of plan.sessions) {
    const start = new Date(s.date);
    start.setHours(9, 0, 0, 0);
    rows.push({
      taskType: "study",
      startDate: start,
      title: `לימוד: ${s.courseName}`,
      courseCode: s.courseCode,
      color: s.color,
      notes: `[auto] ${s.hours}h`,
    });
  }
  return rows;
}

const localKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("planFromStudyTasks — round-trip with the persist shape", () => {
  const inputs: ExamInput[] = [
    { courseCode: "A1", courseName: "מיקרו", examDate: "2026-06-15T00:00:00", credits: 5, averageGrade: 62, failRate: 0.25, moed: "A" },
    { courseCode: "B2", courseName: "פילוסופיה של הדעת ב׳", examDate: "2026-06-22T00:00:00", credits: 4, averageGrade: 85, failRate: 0.05, moed: "B" },
  ];
  const original = generateExamPlan(inputs, NOW);
  const restored = planFromStudyTasks(persistShape(original), new Map(), NOW);

  it("restores every exam on the same LOCAL day with the right moed + difficulty", () => {
    expect(restored.exams).toHaveLength(original.exams.length);
    for (const [i, ex] of original.exams.entries()) {
      expect(localKey(restored.exams[i]!.examDate)).toBe(localKey(ex.examDate));
      expect(restored.exams[i]!.moed).toBe(ex.moed);
      expect(restored.exams[i]!.difficulty).toBe(ex.difficulty);
      expect(restored.exams[i]!.color).toBe(ex.color);
    }
  });

  it("a course NAME containing ב׳ is not misread as Moed B", () => {
    const a1 = restored.exams.find((e) => e.courseCode === "A1");
    expect(a1?.moed).toBe("A");
  });

  it("restores the sessions' day-by-day hours exactly", () => {
    const sum = (plan: { sessions: { date: Date; hours: number }[] }) => {
      const m = new Map<string, number>();
      for (const s of plan.sessions) m.set(localKey(s.date), (m.get(localKey(s.date)) ?? 0) + s.hours);
      return m;
    };
    expect(sum(restored)).toEqual(sum(original));
  });

  it("drops past exams AND their staleness (future-only rule)", () => {
    const past = planFromStudyTasks(persistShape(original), new Map(), new Date("2026-08-01T00:00:00"));
    expect(past.exams).toHaveLength(0);
    expect(past.sessions).toHaveLength(0);
  });

  it("sessions inherit the exam's difficulty per course", () => {
    const hard = restored.sessions.find((s) => s.courseCode === "A1");
    expect(hard?.difficulty).toBe("high"); // avg 62 / fail .25 → high
  });

  it("restores the exam hour BUDGET (from notes), not just the placed hours", () => {
    for (const [i, ex] of original.exams.entries()) {
      expect(restored.exams[i]!.totalHours).toBe(ex.totalHours);
    }
  });

  it("capacity-shortfall rec fires on the RECONSTRUCTED plan too — not just fresh", () => {
    // Tiny capacity → most of the budget can't fit. The budget must survive the
    // round-trip or the warning silently vanishes on the saved plan (STATE B).
    const tight = generateExamPlan(inputs, NOW, [], "steady", { weekdayHours: [0.5, 0.5, 0.5, 0.5, 0.5, 0, 0] });
    const back = planFromStudyTasks(persistShape(tight), new Map(), NOW);
    expect(analyzeExamPeriod(tight, true, NOW).some((r) => r.kind === "capacity")).toBe(true);
    expect(analyzeExamPeriod(back, true, NOW).some((r) => r.kind === "capacity")).toBe(true);
  });
});
