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

// ── recommendMoed (#32): default A (last grade counts), B only when A is tight ──
import { recommendMoed } from "@/lib/exam-planner";

describe("recommendMoed", () => {
  const d = (day: number) => new Date(2026, 0, day);

  it("null when the course has no sittings", () => {
    expect(recommendMoed({ examDateA: null, examDateB: null }, [])).toBeNull();
  });

  it("the only existing sitting wins", () => {
    expect(recommendMoed({ examDateA: null, examDateB: d(20) }, [])).toBe("B");
    expect(recommendMoed({ examDateA: d(10), examDateB: null }, [])).toBe("A");
  });

  it("defaults to A when nothing is crowded", () => {
    expect(recommendMoed({ examDateA: d(10), examDateB: d(30) }, [d(20)])).toBe("A");
  });

  it("recommends B when A is <3 days from another chosen exam and B is free", () => {
    expect(recommendMoed({ examDateA: d(10), examDateB: d(30) }, [d(11)])).toBe("B");
  });

  it("stays on A when BOTH sittings are crowded (no invented advantage)", () => {
    expect(recommendMoed({ examDateA: d(10), examDateB: d(30) }, [d(11), d(29)])).toBe("A");
  });
});

// ── E1′ — the wizard's answers genuinely feed the seeder ──
import { generateExamPlan as genPlan } from "@/lib/exam-planner";

describe("E1′ — two answer profiles produce two different plans", () => {
  const exams = [
    { courseCode: "A-1", courseName: "קורס", examDate: "2026-08-01", credits: 4, averageGrade: 80, failRate: 5, moed: "A" as const },
  ];
  const now = new Date("2026-07-01T10:00:00");

  it("steady spreads beyond a week; crammer concentrates into the last 7 days", () => {
    const steady = genPlan(exams, now, [], "steady");
    const crammer = genPlan(exams, now, [], "crammer");
    const exam = new Date("2026-08-01").getTime();
    const daysBefore = (d: Date) => Math.round((exam - d.getTime()) / 86_400_000);
    // Crammer: every session within the last week before the exam.
    expect(crammer.sessions.every((s) => daysBefore(s.date) <= 7)).toBe(true);
    // Steady: the same sessions reach further back than crammer's window.
    expect(Math.max(...steady.sessions.map((s) => daysBefore(s.date)))).toBeGreaterThan(7);
    // Same total effort — the style shapes WHERE it lands, not how much.
    expect(steady.sessions.length).toBe(crammer.sessions.length);
  });

  it("blocked days are never scheduled", () => {
    const blocked = ["2026-07-31", "2026-07-30"];
    const plan = genPlan(exams, now, blocked, "crammer");
    const keys = plan.sessions.map((s) => `${s.date.getFullYear()}-${String(s.date.getMonth() + 1).padStart(2, "0")}-${String(s.date.getDate()).padStart(2, "0")}`);
    for (const b of blocked) expect(keys).not.toContain(b);
  });
});
