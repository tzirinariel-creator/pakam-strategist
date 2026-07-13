import { describe, it, expect } from "vitest";
import { generateExamPlan, analyzeExamPeriod, classifyDifficulty, confidenceMultiplier, type ExamInput } from "@/lib/exam-planner";

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

  it("steady spreads further back; crammer concentrates near the exam", () => {
    const steady = genPlan(exams, now, [], "steady");
    const crammer = genPlan(exams, now, [], "crammer");
    const exam = new Date("2026-08-01").getTime();
    const daysBefore = (d: Date) => Math.round((exam - d.getTime()) / 86_400_000);
    const crammerMax = Math.max(...crammer.sessions.map((s) => daysBefore(s.date)));
    const steadyMax = Math.max(...steady.sessions.map((s) => daysBefore(s.date)));
    // Crammer stays close to the exam (~last week, allowing for skipped no-study
    // days); steady reaches meaningfully further back.
    expect(crammerMax).toBeLessThanOrEqual(9);
    expect(steadyMax).toBeGreaterThan(crammerMax);
    // Same TOTAL effort — the style shapes WHERE the hours land, not how many.
    const total = (p: { sessions: { hours: number }[] }) =>
      Math.round(p.sessions.reduce((s, x) => s + x.hours, 0) * 10) / 10;
    expect(total(steady)).toBe(total(crammer));
  });

  it("blocked days are never scheduled", () => {
    const blocked = ["2026-07-31", "2026-07-30"];
    const plan = genPlan(exams, now, blocked, "crammer");
    const keys = plan.sessions.map((s) => `${s.date.getFullYear()}-${String(s.date.getMonth() + 1).padStart(2, "0")}-${String(s.date.getDate()).padStart(2, "0")}`);
    for (const b of blocked) expect(keys).not.toContain(b);
  });
});

// ── Phase 2 — capacity: the plan respects how many hours the student has ──
import { type StudyCapacity } from "@/lib/exam-planner";

describe("capacity model", () => {
  const localKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // A heavy 3-course load to stress the shared per-day ledger.
  const heavy = [
    { courseCode: "A", courseName: "A", examDate: "2026-08-01", credits: 6, averageGrade: 60, failRate: 0.3, moed: "A" as const },
    { courseCode: "B", courseName: "B", examDate: "2026-08-02", credits: 6, averageGrade: 60, failRate: 0.3, moed: "A" as const },
    { courseCode: "C", courseName: "C", examDate: "2026-08-03", credits: 6, averageGrade: 60, failRate: 0.3, moed: "A" as const },
  ];
  const now = new Date("2026-07-01T10:00:00");

  it("never schedules more than a day's capacity across ALL courses", () => {
    const cap: StudyCapacity = { weekdayHours: [3, 3, 3, 3, 3, 2, 0] };
    const { sessions } = genPlan(heavy, now, [], "steady", cap);
    const byDay = new Map<string, number>();
    for (const s of sessions) byDay.set(localKey(s.date), (byDay.get(localKey(s.date)) ?? 0) + s.hours);
    for (const [key, hours] of byDay) {
      const [y, m, d] = key.split("-").map(Number);
      const wd = new Date(y!, m! - 1, d!).getDay();
      expect(hours).toBeLessThanOrEqual(cap.weekdayHours[wd]! + 1e-6);
    }
  });

  it("schedules nothing on a weekday whose capacity is 0 (default Saturday)", () => {
    const { sessions } = genPlan(heavy, now, [], "steady"); // DEFAULT_CAPACITY: Sat=0
    expect(sessions.some((s) => s.date.getDay() === 6)).toBe(false);
  });

  it("a per-date override caps a specific day", () => {
    const cap: StudyCapacity = { weekdayHours: [8, 8, 8, 8, 8, 8, 8], overrides: { "2026-07-30": 1 } };
    const { sessions } = genPlan(heavy, now, [], "steady", cap);
    const on30 = sessions.filter((s) => localKey(s.date) === "2026-07-30").reduce((s, x) => s + x.hours, 0);
    expect(on30).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("no single course studies more than the per-day subject max in a day", () => {
    const { sessions } = genPlan(heavy, now, [], "crammer", { weekdayHours: [8, 8, 8, 8, 8, 8, 8] });
    for (const s of sessions) expect(s.hours).toBeLessThanOrEqual(2.5 + 1e-6);
  });

  it("surfaces a capacity-shortfall recommendation when the hours don't fit", () => {
    // A heavy load with almost no capacity → a big chunk can't be scheduled.
    const plan = genPlan(heavy, now, [], "steady", { weekdayHours: [0.5, 0.5, 0.5, 0.5, 0.5, 0, 0] });
    const recs = analyzeExamPeriod(plan, true, now);
    expect(recs.some((r) => r.kind === "capacity")).toBe(true);
  });

  it("no capacity-shortfall recommendation when the plan fits comfortably", () => {
    const plan = genPlan([exam({ credits: 2, averageGrade: 90 })], NOW, [], "steady", { weekdayHours: [8, 8, 8, 8, 8, 8, 8] });
    const recs = analyzeExamPeriod(plan, true, NOW);
    expect(recs.some((r) => r.kind === "capacity")).toBe(false);
  });
});

// ── Phase 3 — self-reported confidence scales the hour budget (not a prediction) ──
describe("confidence", () => {
  it("low readiness budgets MORE hours than high readiness", () => {
    const low = generateExamPlan([exam({ confidence: 1 })], NOW).exams[0]!.totalHours;
    const high = generateExamPlan([exam({ confidence: 5 })], NOW).exams[0]!.totalHours;
    expect(low).toBeGreaterThan(high);
  });

  it("confidence 3 and unset are both neutral (== baseline) — no regression", () => {
    const base = generateExamPlan([exam({})], NOW).exams[0]!.totalHours;
    expect(generateExamPlan([exam({ confidence: 3 })], NOW).exams[0]!.totalHours).toBe(base);
    expect(generateExamPlan([exam({ confidence: undefined })], NOW).exams[0]!.totalHours).toBe(base);
  });

  it("confidenceMultiplier scales, clamps out-of-range, and defaults neutral", () => {
    expect(confidenceMultiplier(1)).toBe(1.4);
    expect(confidenceMultiplier(3)).toBe(1);
    expect(confidenceMultiplier(5)).toBe(0.7);
    expect(confidenceMultiplier(undefined)).toBe(1);
    expect(confidenceMultiplier(null)).toBe(1);
    expect(confidenceMultiplier(0)).toBe(1.4);
    expect(confidenceMultiplier(9)).toBe(0.7);
  });
});

// ── Phase 5 — pre-placed (locked/manual) blocks: the plan fills AROUND them ──
describe("pre-placed / locked blocks", () => {
  const lk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cap8 = { weekdayHours: [8, 8, 8, 8, 8, 8, 8] };
  const sumX = (p: { sessions: { courseCode: string; hours: number }[] }) =>
    p.sessions.filter((s) => s.courseCode === "X").reduce((a, b) => a + b.hours, 0);

  it("reduces the course's newly-scheduled hours by the pre-placed amount", () => {
    const e = [exam({ courseCode: "X", credits: 5, averageGrade: 60, failRate: 0.3 })]; // high → 20h budget
    const base = sumX(generateExamPlan(e, NOW, [], "steady", cap8));
    const withPre = sumX(generateExamPlan(e, NOW, [], "steady", cap8, [{ courseCode: "X", date: new Date("2026-06-05T09:00:00"), hours: 5 }]));
    expect(Math.round(withPre)).toBe(Math.round(base - 5));
  });

  it("a pre-placed block consumes that day's shared capacity (fills around)", () => {
    const e = [exam({ courseCode: "Y", credits: 3, averageGrade: 90 })];
    const plan = generateExamPlan(e, NOW, [], "crammer", { weekdayHours: [3, 3, 3, 3, 3, 3, 3] }, [{ courseCode: "Z", date: new Date("2026-06-14T09:00:00"), hours: 3 }]);
    expect(plan.sessions.filter((s) => lk(s.date) === "2026-06-14").reduce((a, b) => a + b.hours, 0)).toBe(0);
  });

  it("counts a pre-placed block toward the per-course daily max", () => {
    const e = [exam({ courseCode: "X", credits: 6, averageGrade: 60, failRate: 0.3 })];
    const plan = generateExamPlan(e, NOW, [], "crammer", cap8, [{ courseCode: "X", date: new Date("2026-06-14T09:00:00"), hours: 2.5 }]);
    expect(plan.sessions.filter((s) => s.courseCode === "X" && lk(s.date) === "2026-06-14").reduce((a, b) => a + b.hours, 0)).toBe(0);
  });

  it("a PAST pre-placed block is ignored (doesn't consume budget or capacity)", () => {
    const e = [exam({ courseCode: "X", credits: 5, averageGrade: 60, failRate: 0.3 })];
    const base = sumX(generateExamPlan(e, NOW, [], "steady", cap8));
    const past = sumX(generateExamPlan(e, NOW, [], "steady", cap8, [{ courseCode: "X", date: new Date("2026-05-20T09:00:00"), hours: 5 }]));
    expect(Math.round(past)).toBe(Math.round(base));
  });
});
