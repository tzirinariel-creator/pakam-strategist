// =========================================================================
// Why the exam planner has nothing to offer (#39).
//
// The planner used to collapse FOUR different situations into one dead-end
// line — "אין מבחנים קרובים בתכנית שלכם" — which reads like a bug:
//   • the student has no plan at all,
//   • the plan holds only paper/referat courses (no exam to plan),
//   • the university hasn't PUBLISHED the exam timetable yet (the תשפ״ז case:
//     the catalog was migrated to the new yedion and its exam tab is empty),
//   • or every sitting in the plan has already passed.
// Only the first is "you planned none". The third is missing DATA, and the
// product must say so instead of implying the student did something wrong.
//
// Pure + injectable `now`, so the distinction is regression-testable.
// =========================================================================

import { yedionExamDates } from "@/lib/yedion-assessments";

export type ExamPlannerEmptyReason =
  /** No courses in the plan at all — nothing to draw exam dates from. */
  | "no-plan"
  /** Courses exist, but every one is assessed by a paper/referat/nothing. */
  | "no-exam-courses"
  /** Exam courses exist and NOT ONE has a date in the catalog → unpublished. */
  | "not-published"
  /** Dates exist, but every sitting is already behind us. */
  | "all-past";

/** The minimum a planned course must expose to be classified. */
export interface ExamAvailabilityCourse {
  code: string;
  submissionType?: string | null;
  examDateA: Date | string | null;
  examDateB: Date | string | null;
  status?: string | null;
  grade?: number | null;
}

export interface ExamAvailability {
  /** null = there ARE upcoming sittings; the picker has something to show. */
  reason: ExamPlannerEmptyReason | null;
  /** Distinct, not-yet-graded courses in the plan. */
  plannedCount: number;
  /** Of those, the ones actually assessed by an exam. */
  examCourseCount: number;
  /** Of the exam courses, how many carry ANY date in the catalog. */
  withAnyDate: number;
  /** Of the exam courses, how many carry an upcoming (today or later) date. */
  withUpcomingDate: number;
}

/** A course is behind us only when it's COMPLETED *and* graded — a failed or
 *  ungraded course still has a Moed-B ahead (same rule as days-until.ts). */
function isDone(c: ExamAvailabilityCourse): boolean {
  return c.status === "COMPLETED" && c.grade != null;
}

/** PAPER / REFERAT / NONE have no sitting to plan. An unknown/missing value is
 *  treated as an exam course — never hide a course on a guess.
 *
 *  Exported so every surface that draws a sitting asks the SAME question (#21):
 *  the exam gantt used to ignore submissionType entirely, so a paper course
 *  carrying a stale catalog date drew a full exam bar. */
export function isExamAssessed(c: Pick<ExamAvailabilityCourse, "submissionType">): boolean {
  const t = c.submissionType;
  if (t == null) return true;
  return t !== "PAPER" && t !== "REFERAT" && t !== "NONE";
}

export function classifyExamAvailability(
  courses: ExamAvailabilityCourse[],
  now: Date = new Date(),
): ExamAvailability {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const seen = new Set<string>();
  const planned: ExamAvailabilityCourse[] = [];
  for (const c of courses) {
    if (seen.has(c.code)) continue;
    if (isDone(c)) continue;
    seen.add(c.code);
    planned.push(c);
  }

  const examCourses = planned.filter(isExamAssessed);
  let withAnyDate = 0;
  let withUpcomingDate = 0;
  for (const c of examCourses) {
    // The ידיעון board counts as published, because it IS published.
    //
    // This classifier only ever saw the caller's examDateA/B, which every
    // caller filled from the scraped CATALOG — תשפ״ו, all of it now behind us.
    // So for the year actually being planned it reported "the university
    // hasn't published the timetable yet" about courses whose sittings are
    // printed in the ידיעון, while the screen beside it drew those very
    // sittings. A product that shows a date on one screen and denies it on the
    // next is worse than either message on its own.
    //
    // Resolved here rather than at each call site: the classifier already
    // takes the course code, and this exact fix reaching one caller and not
    // the other is how the problem got in.
    const yedion = yedionExamDates(c.code);
    const dates = [c.examDateA, c.examDateB, yedion.examDateA, yedion.examDateB]
      .filter((d): d is Date | string => d != null)
      .map((d) => new Date(d));
    if (dates.length === 0) continue;
    withAnyDate++;
    if (dates.some((d) => d.getTime() >= startOfToday)) withUpcomingDate++;
  }

  const stats = {
    plannedCount: planned.length,
    examCourseCount: examCourses.length,
    withAnyDate,
    withUpcomingDate,
  };

  if (planned.length === 0) return { reason: "no-plan", ...stats };
  if (examCourses.length === 0) return { reason: "no-exam-courses", ...stats };
  if (withUpcomingDate > 0) return { reason: null, ...stats };
  // The load-bearing distinction: nothing published vs. everything behind us.
  return { reason: withAnyDate === 0 ? "not-published" : "all-past", ...stats };
}
