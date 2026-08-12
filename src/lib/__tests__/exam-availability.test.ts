// =========================================================================
// #39 — the exam planner's empty state must tell the CAUSES apart.
//
// The bug Ariel hit: he opened the planner INSIDE a real exam period and got
// "אין מבחנים קרובים בתכנית שלכם" — the same sentence a student with an empty
// plan gets. The real cause was missing DATA (the catalog was migrated to the
// תשפ״ז yedion and TAU hasn't published its exam timetable), which is not the
// student's doing and must never be reported as if it were.
// =========================================================================
import { describe, it, expect } from "vitest";
import {
  classifyExamAvailability,
  type ExamAvailabilityCourse,
} from "@/lib/exam-availability";

const now = new Date(2026, 7, 13, 12, 0, 0); // 13.8.2026 — inside תשפ״ו spring exams
const course = (o: Partial<ExamAvailabilityCourse> & { code: string }): ExamAvailabilityCourse => ({
  submissionType: "EXAM",
  examDateA: null,
  examDateB: null,
  status: "PLANNED",
  grade: null,
  ...o,
});

describe("classifyExamAvailability — WHY the picker is empty", () => {
  it("THE distinction: an unpublished timetable is NOT 'you planned no exams'", () => {
    // Same visible outcome (an empty picker), two different causes — and the
    // product has to say two different things.
    const noPlan = classifyExamAvailability([], now);
    const unpublished = classifyExamAvailability(
      [course({ code: "1011-1111" }), course({ code: "1011-2222" }), course({ code: "1011-3333" })],
      now,
    );

    expect(noPlan.reason).toBe("no-plan");
    expect(unpublished.reason).toBe("not-published");
    expect(noPlan.reason).not.toBe(unpublished.reason);
    // The honest count the copy leans on ("בתכנית שלכם 3 קורסים…").
    expect(unpublished.plannedCount).toBe(3);
    expect(unpublished.withAnyDate).toBe(0);
  });

  it("dates that all sat in the past → 'all-past', never 'not-published'", () => {
    const a = classifyExamAvailability(
      [course({ code: "1011-1111", examDateA: new Date(2026, 6, 20), examDateB: new Date(2026, 7, 3) })],
      now,
    );
    expect(a.reason).toBe("all-past");
    expect(a.withAnyDate).toBe(1);
    expect(a.withUpcomingDate).toBe(0);
  });

  it("one upcoming sitting anywhere → no empty state at all", () => {
    const a = classifyExamAvailability(
      [
        course({ code: "1011-1111", examDateA: new Date(2026, 6, 20) }), // past
        course({ code: "1011-2222", examDateB: new Date(2026, 7, 25) }), // ahead
      ],
      now,
    );
    expect(a.reason).toBeNull();
    expect(a.withUpcomingDate).toBe(1);
  });

  it("today's sitting still counts as upcoming (a civil-day test, not a ms one)", () => {
    const a = classifyExamAvailability(
      [course({ code: "1011-1111", examDateA: new Date(2026, 7, 13) })],
      now,
    );
    expect(a.reason).toBeNull();
  });

  it("a plan of papers/referats says so instead of blaming missing dates", () => {
    const a = classifyExamAvailability(
      [
        course({ code: "1011-1111", submissionType: "PAPER" }),
        course({ code: "1011-2222", submissionType: "REFERAT" }),
        course({ code: "1011-3333", submissionType: "NONE" }),
      ],
      now,
    );
    expect(a.reason).toBe("no-exam-courses");
    expect(a.examCourseCount).toBe(0);
  });

  it("an unknown submissionType is treated as an exam course — never hide a course on a guess", () => {
    const a = classifyExamAvailability([course({ code: "1011-1111", submissionType: null })], now);
    expect(a.reason).toBe("not-published");
    expect(a.examCourseCount).toBe(1);
  });

  it("graded-and-completed courses drop out; a FAILED/ungraded one still counts (Moed B ahead)", () => {
    const a = classifyExamAvailability(
      [
        course({ code: "1011-1111", status: "COMPLETED", grade: 88 }),
        course({ code: "1011-2222", status: "COMPLETED", grade: null }),
      ],
      now,
    );
    expect(a.plannedCount).toBe(1);
    expect(a.reason).toBe("not-published");
  });

  it("the same course planned twice is counted once", () => {
    const a = classifyExamAvailability(
      [course({ code: "1011-1111" }), course({ code: "1011-1111" })],
      now,
    );
    expect(a.plannedCount).toBe(1);
  });

  it("a plan that is entirely completed-and-graded reads as 'no-plan', not 'not-published'", () => {
    const a = classifyExamAvailability(
      [course({ code: "1011-1111", status: "COMPLETED", grade: 90 })],
      now,
    );
    expect(a.reason).toBe("no-plan");
  });
});
