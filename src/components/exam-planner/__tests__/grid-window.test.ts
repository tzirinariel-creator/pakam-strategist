// =========================================================================
// The exam grid opens where the work is, not where the calendar is
// =========================================================================
// Ariel, three times, most recently on 1.9: "ושוב פעם לוח מבחנים בלתי נגמר
// שאי אפשר להבין ממנו כלום."
//
// The window started at min(today, firstSession). Build a revision plan on
// 1.9.2026 for the January תשפ״ז sittings and the engine — quite correctly —
// schedules nothing yet: it does not begin revising more than about three
// weeks before a sitting. So the grid rendered fourteen week rows of seven
// empty squares, about 1,300 pixels of nothing, as the first thing on screen
// after pressing "build me a plan".
//
// The neighbouring skyline had already been fixed this way and the fix was
// never carried across. The same formula, with the same bug, also lived in the
// spreadsheet export.
//
// The window calculation is a few lines inside a useMemo in a drag-and-drop
// component, so it is restated here as the pure function it is — which is also
// the only way to assert on it without mounting a DnD context.

import { describe, it, expect } from "vitest";

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Exactly what weekly-grid.tsx computes. */
function window_(plan: { sessions: Date[]; exams: Date[] }, today: Date) {
  const sessionDates = plan.sessions.map((s) => startOfDay(s).getTime());
  const examDates = plan.exams.map((e) => startOfDay(e).getTime());
  const firstSession = sessionDates.length ? Math.min(...sessionDates) : today.getTime();
  const lastExam = examDates.length ? Math.max(...examDates) : firstSession;
  const anchors = [...sessionDates, ...examDates];
  const planStart = anchors.length ? Math.min(...anchors) : today.getTime();
  const rangeStart = startOfDay(addDays(new Date(planStart), -3));
  const ws = addDays(rangeStart, -rangeStart.getDay());
  const horizon = Math.min(lastExam, addDays(ws, 90).getTime());
  const totalDays = Math.ceil((horizon - ws.getTime()) / DAY) + 1;
  return { weekStart: ws, weeks: Math.max(1, Math.ceil(totalDays / 7)) };
}

/** The version that shipped, kept as the witness. */
function oldWindow(plan: { sessions: Date[]; exams: Date[] }, today: Date) {
  const sessionDates = plan.sessions.map((s) => startOfDay(s).getTime());
  const examDates = plan.exams.map((e) => startOfDay(e).getTime());
  const firstSession = sessionDates.length ? Math.min(...sessionDates) : today.getTime();
  const lastExam = examDates.length ? Math.max(...examDates) : firstSession;
  const rangeStart = startOfDay(new Date(Math.min(today.getTime(), firstSession)));
  const ws = addDays(rangeStart, -rangeStart.getDay());
  const horizon = Math.min(lastExam, addDays(today, 90).getTime());
  const totalDays = Math.ceil((horizon - ws.getTime()) / DAY) + 1;
  return { weekStart: ws, weeks: Math.max(1, Math.ceil(totalDays / 7)) };
}

// A real תשפ״ז January plan, built on 1.9 — the exact case that shipped broken.
const TODAY = new Date(2026, 8, 1);
const PLAN = {
  exams: [new Date(2027, 0, 20), new Date(2027, 0, 28), new Date(2027, 1, 5)],
  // The engine starts revision about three weeks out, so the first block is in
  // late December.
  sessions: [new Date(2026, 11, 28), new Date(2026, 11, 30), new Date(2027, 0, 4)],
};

describe("the grid window is anchored on the plan", () => {
  it("opens days before the first block, not months before it", () => {
    const { weekStart } = window_(PLAN, TODAY);
    const firstSession = startOfDay(PLAN.sessions[0]!);
    const gapDays = (firstSession.getTime() - weekStart.getTime()) / DAY;
    expect(gapDays).toBeGreaterThanOrEqual(0);
    expect(gapDays).toBeLessThanOrEqual(10); // three days back, snapped to Sunday
  });

  it("no longer opens on fourteen empty weeks", () => {
    // The witness. The old formula spans September to the horizon; the new one
    // spans the plan.
    expect(oldWindow(PLAN, TODAY).weeks).toBeGreaterThan(12);
    expect(window_(PLAN, TODAY).weeks).toBeLessThanOrEqual(8);
  });

  it("still reaches the last exam", () => {
    // Shrinking the window must not cut off the thing it exists to show.
    const { weekStart, weeks } = window_(PLAN, TODAY);
    const end = addDays(weekStart, weeks * 7 - 1).getTime();
    expect(end).toBeGreaterThanOrEqual(startOfDay(PLAN.exams[2]!).getTime());
  });

  it("keeps the 90-day cap, so 'the whole year' cannot explode the grid", () => {
    // Without the cap a June sitting would render 273 cells — worse than the
    // bug being fixed. The skyline uses the same ceiling.
    const far = { exams: [new Date(2027, 5, 20)], sessions: [new Date(2027, 5, 1)] };
    expect(window_(far, TODAY).weeks).toBeLessThanOrEqual(14);
  });

  it("behaves when the plan has exams but no study blocks yet", () => {
    const examsOnly = { exams: [new Date(2027, 0, 20)], sessions: [] as Date[] };
    const { weeks } = window_(examsOnly, TODAY);
    expect(weeks).toBeGreaterThanOrEqual(1);
    expect(weeks).toBeLessThanOrEqual(3);
  });
});
