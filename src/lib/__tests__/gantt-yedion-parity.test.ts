// =========================================================================
// Both exam screens read the same year
// =========================================================================
// `exam-date-source.ts` exists because the planner preferred the scraped
// CATALOG (תשפ״ו — every date behind us) over the ידיעון board (תשפ״ז — the
// year being planned). Preferring the stale source nulled the date, and the
// planner drops a course with no date, so 22 of 23 exam courses vanished with
// no message at all.
//
// That was fixed on /exam-planner. The semester planner's gantt beside it
// still read `examDateA/B` alone, and `classifyExamAvailability` — the shared
// predicate that decides WHICH empty state to print — only ever looked at the
// caller's two catalog fields.
//
// So the two screens could contradict each other about the same course: one
// drawing a sitting from the ידיעון, the other saying the university had not
// published a timetable. A product that shows a date on one screen and denies
// it on the next is worse than either message on its own.
//
// This pins the property across both: a course whose ONLY published sitting is
// in the ידיעון counts as published, and lands on the grid.

import { describe, it, expect } from "vitest";
import { classifyExamAvailability } from "@/lib/exam-availability";
import { resolveExamDates } from "@/lib/exam-date-source";
import { yedionExamDates } from "@/lib/yedion-assessments";
import assessments from "@/data/yedion-5787-assessments.json";

/** A real course code from the board, with a real מועד א׳ — no invented dates. */
const withSitting = (() => {
  const { records } = assessments as unknown as { records: { courseCode?: string }[] };
  for (const r of records ?? []) {
    if (!r.courseCode) continue;
    const y = yedionExamDates(r.courseCode);
    if (y.examDateA) return { code: r.courseCode, date: y.examDateA };
  }
  return null;
})();

describe("the ידיעון board counts as published on every screen", () => {
  it("has at least one real sitting to test against", () => {
    // A guard on the guard: if the board stops parsing, every assertion below
    // would pass vacuously and this file would stop meaning anything.
    expect(withSitting).not.toBeNull();
  });

  it("does not report 'not published' for a course the board publishes", () => {
    const { code } = withSitting!;
    const { reason } = classifyExamAvailability(
      // Catalog blank — the תשפ״ז reality, where the exam tab was migrated out.
      [{ code, submissionType: null, examDateA: null, examDateB: null }],
      new Date(2026, 8, 1),
    );
    expect(reason).not.toBe("not-published");
  });

  it("still says 'not published' when NOTHING has a date", () => {
    // The message must keep working, or the fix has merely silenced it.
    const { reason } = classifyExamAvailability(
      [{ code: "0000-0000", submissionType: null, examDateA: null, examDateB: null }],
      new Date(2026, 8, 1),
    );
    expect(reason).toBe("not-published");
  });

  it("resolves the same sitting the gantt now draws", () => {
    // The two screens agree by construction: same board, same precedence.
    const { code, date } = withSitting!;
    const y = yedionExamDates(code);
    const resolved = resolveExamDates(
      { catalogA: null, catalogB: null, yedionA: y.examDateA, yedionB: y.examDateB, manual: null },
      new Date(2026, 0, 1),
    );
    expect(resolved.examDateA?.getTime()).toBe(date.getTime());
    expect(resolved.sourceA).toBe("yedion");
  });

  it("a stale catalog date never masks a live board date", () => {
    // The original defect, stated directly. The catalog entry is real and in
    // the past; the board entry is the one the student needs.
    const { code, date } = withSitting!;
    const y = yedionExamDates(code);
    const resolved = resolveExamDates(
      { catalogA: new Date(2025, 0, 15), catalogB: null, yedionA: y.examDateA, yedionB: y.examDateB, manual: null },
      new Date(2026, 8, 1),
    );
    expect(resolved.examDateA?.getTime()).toBe(date.getTime());
  });
});
