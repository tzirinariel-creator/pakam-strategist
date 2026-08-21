// Ariel, 21.8: "למה הוא לא בונה תוכנית לימוד?"
// It was building one — 42 study sessions. The chart walked today → +90 days
// while a plan for a January exam does not start for ~127, so the whole plan
// fell past the right-hand edge and the screen showed one empty rest cell.
import { describe, it, expect } from "vitest";
import { buildSkylineModel } from "../study-skyline";
import { generateExamPlan, DEFAULT_CAPACITY } from "@/lib/exam-planner";

const NOW = new Date("2026-08-21T09:00:00+03:00");

const FAR_EXAMS = [
  { courseCode: "1011-2101", courseName: "מאקרו כלכלה + תרגיל", credits: 6, examDate: new Date("2027-01-21T09:00:00Z"), moed: "A" as const },
  { courseCode: "0651-1007", courseName: 'מתמטיקה לפכ"מ', credits: 5, examDate: new Date("2027-01-20T09:00:00Z"), moed: "A" as const },
];

describe("skyline window", () => {
  it("the generator really does produce a plan for a distant exam", () => {
    // Guarding the premise: if this ever returns nothing, the complaint would
    // be about the engine and not the chart, and the fix would be elsewhere.
    const plan = generateExamPlan(FAR_EXAMS, NOW, [], "steady", DEFAULT_CAPACITY);
    expect(plan.sessions.length).toBeGreaterThan(0);
  });

  it("opens on the plan, not on today, when the plan is months away", () => {
    const plan = generateExamPlan(FAR_EXAMS, NOW, [], "steady", DEFAULT_CAPACITY);
    const m = buildSkylineModel(plan, NOW);
    expect(m.startsInDays).toBeGreaterThan(7);
    expect(m.windowStart).not.toBeNull();
    // ...and the chart now actually contains the study blocks.
    const withBars = m.items.filter((i) => i.kind === "day" && i.bars.length > 0);
    expect(withBars.length).toBeGreaterThan(0);
  });

  it("still opens today when the exams are near", () => {
    const soon = [
      { courseCode: "1011-2101", courseName: "מאקרו", credits: 6, examDate: new Date("2026-09-10T09:00:00Z"), moed: "A" as const },
    ];
    const plan = generateExamPlan(soon, NOW, [], "steady", DEFAULT_CAPACITY);
    const m = buildSkylineModel(plan, NOW);
    expect(m.startsInDays).toBe(0);
  });

  it("marks today by date, not by being the first column", () => {
    // The window can now open in December, so "column 0" and "today" are no
    // longer the same day — reading isToday off the index would put the
    // today-marker on an arbitrary winter date.
    const plan = generateExamPlan(FAR_EXAMS, NOW, [], "steady", DEFAULT_CAPACITY);
    const m = buildSkylineModel(plan, NOW);
    const todays = m.items.filter((i) => i.kind === "day" && i.isToday);
    expect(todays.length).toBe(0); // today sits before the window entirely
    expect(m.todayHours).toBe(0);
  });
});
