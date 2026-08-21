// =========================================================================
// "כדאי לי ללכת למועד ב׳?" — answered with the student's own numbers
// =========================================================================
// Ariel, 21.8: "איפה הפיצר / אשף בחירה האם לעשות מועדי ב׳ וסימולציות ציון כמו
// באפליקציה שהעליתי לך צילומי מסך שלה?" and "הוא פחות עוזר להחליט אם לגשת
// למועדי ב או לא ולהבין את המצב בכללי".
//
// The pieces existed and never met. The simulator lived on the graduation page
// as a general "what if" sandbox; the exam planner knew the sittings; nothing
// put them together at the moment the decision is actually made, which is when
// a student is holding a grade they are unhappy with.
//
// The decision has exactly three inputs and one hard rule:
//
//   THE RULE — for most students מועד ב׳ REPLACES מועד א׳. Not "the better of
//   the two": the later sitting is the one that counts, even if it is worse.
//   Reservists in groups B, C and G keep the higher of the two, which flips the
//   decision completely, so the group has to be part of the answer rather than
//   a footnote under it.
//
//   THE UPSIDE — what the degree average becomes if the retake goes well.
//   Computed by the same engine as everything else, so it cannot disagree with
//   the number on the dashboard.
//
//   THE DOWNSIDE — what it becomes if the retake goes badly. For a student
//   whose grade is replaced, this is the whole risk, and it is the half that
//   apps like this one habitually leave out.
//
// What this module refuses to do is tell the student what to do. It states
// both outcomes and the rule that governs them. "Worth it" depends on how much
// they want to study in August, which is not ours to weigh.

import type { UserCourseWithCourse } from "@/types/degree";
import { simulate } from "@/lib/grade-simulator";

export interface MoedBInputs {
  /** The student's whole record — the average must match the rest of the app. */
  courses: UserCourseWithCourse[];
  /** UserCourse id of the course being reconsidered. */
  userCourseId: string;
  /** Groups B/C/G keep the HIGHER sitting. See prefersHigherGrade(). */
  keepsHigherGrade: boolean;
  /** A realistic better result. */
  optimisticGrade: number;
  /** A realistic worse result — the half that usually goes unsaid. */
  pessimisticGrade: number;
}

export interface MoedBOutcome {
  /** The grade this course carries today. */
  currentGrade: number;
  /** Degree course-average as it stands. */
  currentAverage: number | null;
  /** Average if the retake goes well. */
  averageIfBetter: number | null;
  /** Average if it goes badly — equals current when the higher grade is kept. */
  averageIfWorse: number | null;
  /** Points gained in the good case. Null when the average is unknown. */
  upside: number | null;
  /**
   * Points LOST in the bad case, as a positive number. Zero for a student who
   * keeps the higher sitting — for them there is genuinely nothing to lose,
   * and saying so plainly is the most useful thing on the screen.
   */
  downside: number | null;
  /** Whether a worse sitting can actually cost this student anything. */
  canLose: boolean;
}

/**
 * Model both outcomes of sitting מועד ב׳ for one course.
 *
 * Returns null when the course is not in the record or carries no grade —
 * there is no decision to model until there is a result to improve on.
 */
export function moedBOutcome(inputs: MoedBInputs): MoedBOutcome | null {
  const { courses, userCourseId, keepsHigherGrade } = inputs;
  const target = courses.find((c) => c.id === userCourseId);
  if (!target || target.grade == null) return null;

  const currentGrade = target.grade;
  const optimistic = simulate(
    courses,
    { [userCourseId]: { grade: inputs.optimisticGrade } },
    { preferHigherGrade: keepsHigherGrade },
  );

  // The pessimistic case only bites when the LATER sitting is the one that
  // counts. For B/C/G the record keeps the higher grade, so a worse sitting
  // changes nothing — model that as "no change" rather than as a loss.
  const worseGrade = keepsHigherGrade
    ? Math.max(currentGrade, inputs.pessimisticGrade)
    : inputs.pessimisticGrade;
  const pessimistic = simulate(
    courses,
    { [userCourseId]: { grade: worseGrade } },
    { preferHigherGrade: keepsHigherGrade },
  );

  const currentAverage = optimistic.current.courseAverage ?? null;
  const averageIfBetter = optimistic.simulated.courseAverage ?? null;
  const averageIfWorse = pessimistic.simulated.courseAverage ?? null;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    currentGrade,
    currentAverage: currentAverage == null ? null : round2(currentAverage),
    averageIfBetter: averageIfBetter == null ? null : round2(averageIfBetter),
    averageIfWorse: averageIfWorse == null ? null : round2(averageIfWorse),
    upside:
      currentAverage == null || averageIfBetter == null
        ? null
        : round2(averageIfBetter - currentAverage),
    downside:
      currentAverage == null || averageIfWorse == null
        ? null
        : round2(Math.max(0, currentAverage - averageIfWorse)),
    canLose: !keepsHigherGrade,
  };
}

/**
 * How much a single course can move a whole degree average — the fact that
 * most often settles this decision, and the one students consistently
 * over-estimate.
 *
 * A 4-credit course inside a 120-credit degree carries about 3% of the
 * average, so turning a 78 into a 90 moves it by well under half a point. That
 * is worth knowing BEFORE giving up a August.
 */
export function courseWeightInAverage(
  courses: UserCourseWithCourse[],
  userCourseId: string,
  countsTowardAverage: (uc: UserCourseWithCourse) => boolean,
): number | null {
  const target = courses.find((c) => c.id === userCourseId);
  if (!target) return null;
  const counted = courses.filter(countsTowardAverage);
  const totalCredits = counted.reduce((s, c) => s + (c.course.credits ?? 0), 0);
  if (totalCredits <= 0) return null;
  return Math.round(((target.course.credits ?? 0) / totalCredits) * 1000) / 10;
}
