import { describe, it, expect, vi } from "vitest";
// Difficulty inheritance is gated behind ARAZIM_ENABLED ("בלי ארזים כרגע");
// this round-trip test exercises the Arazim-enabled path.
vi.mock("@/lib/arazim/visibility", async (orig) => ({
  ...(await orig<typeof import("@/lib/arazim/visibility")>()),
  ARAZIM_ENABLED: true,
}));
import { generateExamPlan, analyzeExamPeriod, type ExamInput } from "@/lib/exam-planner";
import { planFromStudyTasks, survivesRetune, buildPrePlaced, type StudyTaskLike } from "@/lib/plan-from-tasks";

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

describe("shortfall stays horizon-consistent as sessions elapse (QA 13.7)", () => {
  // One hard exam far enough out that the default capacity comfortably fits it.
  const one: ExamInput[] = [
    { courseCode: "A1", courseName: "מיקרו", examDate: "2026-06-20T00:00:00", credits: 5, averageGrade: 62, failRate: 0.25, moed: "A" },
  ];
  const MID = new Date("2026-06-14T00:00:00"); // ~half the June 1→20 window is behind us

  it("an on-track plan does NOT false-fire once part of it is behind us", () => {
    const built = generateExamPlan(one, NOW); // generous default capacity → everything fit
    expect(analyzeExamPeriod(built, true, NOW).some((r) => r.kind === "capacity")).toBe(false);
    // Reconstruct mid-period: elapsed sessions are gone but the budget is billed
    // down to match, so no phantom "hours didn't fit" alert on a healthy plan.
    const back = planFromStudyTasks(persistShape(built), new Map(), MID);
    expect(analyzeExamPeriod(back, true, MID).some((r) => r.kind === "capacity")).toBe(false);
  });

  it("a genuinely tight plan STILL fires after elapse (the fix didn't just mute it)", () => {
    const tight = generateExamPlan(one, NOW, [], "steady", { weekdayHours: [0.5, 0.5, 0.5, 0.5, 0.5, 0, 0] });
    expect(analyzeExamPeriod(tight, true, NOW).some((r) => r.kind === "capacity")).toBe(true);
    const back = planFromStudyTasks(persistShape(tight), new Map(), MID);
    expect(analyzeExamPeriod(back, true, MID).some((r) => r.kind === "capacity")).toBe(true);
  });
});

describe("survivesRetune + buildPrePlaced (Phase 5)", () => {
  it("survivesRetune: auto is wiped, locked/manual are kept", () => {
    expect(survivesRetune("[auto] 2.5h")).toBe(false);
    expect(survivesRetune("[auto] 2.5h [locked]")).toBe(true);
    expect(survivesRetune("2.5h")).toBe(true); // manual quick-add
    expect(survivesRetune(null)).toBe(true);
  });

  it("buildPrePlaced keeps only future, uncompleted, in-set locked/manual STUDY blocks", () => {
    const today = new Date("2026-06-01T00:00:00");
    const tasks = [
      { taskType: "study", startDate: new Date("2026-06-10T09:00:00"), notes: "[auto] 2.5h [locked]", courseCode: "A", completed: false }, // keep
      { taskType: "study", startDate: new Date("2026-06-11T09:00:00"), notes: "[auto] 2.5h", courseCode: "A", completed: false }, // unlocked auto → drop
      { taskType: "study", startDate: new Date("2026-06-12T09:00:00"), notes: "2h", courseCode: "A", completed: false }, // manual → keep
      { taskType: "study", startDate: new Date("2026-06-13T09:00:00"), notes: "[auto] 2.5h [locked]", courseCode: "A", completed: true }, // completed → drop
      { taskType: "study", startDate: new Date("2026-05-20T09:00:00"), notes: "[auto] 2.5h [locked]", courseCode: "A", completed: false }, // past → drop
      { taskType: "exam", startDate: new Date("2026-06-15T12:00:00"), notes: "[auto] high budget=20", courseCode: "A", completed: false }, // not study → drop
      { taskType: "study", startDate: new Date("2026-06-14T09:00:00"), notes: "[auto] 2.5h [locked]", courseCode: "B", completed: false }, // not in set → drop
    ];
    const pre = buildPrePlaced(tasks, today, new Set(["A"]));
    expect(pre).toHaveLength(2);
    expect(pre.every((p) => p.courseCode === "A")).toBe(true);
    expect(pre.map((p) => p.hours).sort()).toEqual([2, 2.5]);
  });
});
