// =========================================================================
// The whole year, side by side, for the bidding round
// =========================================================================
// Ariel, 21.8: "אולי נעשה לקראת הבידינג מסך תכנון אחוד לכל השנה לשני סמסטרים
// כמו בביד-איט? כדי שנוכל להתחרות בהם".
//
// The planner already boards both semesters, and the bidding toolkit already
// checks clashes and builds a checklist — but the toolkit is scoped to ONE
// semester, the next one. That scoping is wrong for PPE specifically: TAU's
// own wording is that "הרישום בחלק מהחוגים סמסטריאלי ובחלק שנתי", and a PPE
// student registers through several departments at once. Some of their
// semester-ב׳ courses are chosen in the SAME round as semester א׳. Planning
// only the near semester is planning half of what is about to be registered.
//
// This assembles the year as one object so the screen can put both terms side
// by side and total them — the view a student actually bids from.
//
// It states quantities and leaves the judgement alone. Nothing here predicts a
// bidding point, ranks a course's chances, or suggests how to spend a budget:
// TAU does not publish the quota, and inventing one is this project's single
// hardest prohibition.

import type { UserCourseWithCourse } from "@/types/degree";

export type Term = "FALL" | "SPRING";

export interface YearCourse {
  userCourseId: string;
  code: string;
  name: string;
  credits: number;
  /** Mandatory courses are not really a choice — worth separating visually. */
  isMandatory: boolean;
}

export interface TermPlan {
  term: Term;
  courses: YearCourse[];
  credits: number;
  /** Mandatory credits within the term — the part that is not negotiable. */
  mandatoryCredits: number;
}

export interface YearPlan {
  /** Year of study (1-3), not an academic year. */
  yearOfStudy: number;
  fall: TermPlan;
  spring: TermPlan;
  /** Both terms combined — the number the bidding round is really about. */
  totalCredits: number;
  totalCourses: number;
  /** True when at least one term has nothing in it yet. */
  hasEmptyTerm: boolean;
}

function buildTerm(term: Term, rows: UserCourseWithCourse[]): TermPlan {
  const courses: YearCourse[] = rows.map((uc) => ({
    userCourseId: uc.id,
    code: uc.course.code,
    name: uc.course.nameHe,
    credits: uc.course.credits ?? 0,
    isMandatory:
      uc.course.courseType === "MANDATORY" || uc.course.isMandatory === true,
  }));
  // Heaviest first: on a bidding screen the big commitments should be read
  // before the two-credit electives, not after them.
  courses.sort((a, b) => b.credits - a.credits || a.name.localeCompare(b.name, "he"));
  return {
    term,
    courses,
    credits: Math.round(courses.reduce((s, c) => s + c.credits, 0) * 10) / 10,
    mandatoryCredits:
      Math.round(courses.filter((c) => c.isMandatory).reduce((s, c) => s + c.credits, 0) * 10) / 10,
  };
}

/**
 * Both terms of one year of study, from the student's plan.
 *
 * Only PLANNED rows are included. A course already completed or currently
 * enrolled is not something they are about to bid for, and listing it on a
 * registration screen invites bidding for a course they already hold.
 */
export function yearAtAGlance(
  courses: UserCourseWithCourse[],
  yearOfStudy: number,
): YearPlan {
  const inYear = courses.filter(
    (uc) =>
      uc.plannedYear === yearOfStudy &&
      uc.status !== "COMPLETED" &&
      uc.status !== "FAILED" &&
      uc.status !== "EXEMPT",
  );
  const fall = buildTerm("FALL", inYear.filter((uc) => uc.plannedSemester === "FALL"));
  const spring = buildTerm("SPRING", inYear.filter((uc) => uc.plannedSemester === "SPRING"));

  return {
    yearOfStudy,
    fall,
    spring,
    totalCredits: Math.round((fall.credits + spring.credits) * 10) / 10,
    totalCourses: fall.courses.length + spring.courses.length,
    hasEmptyTerm: fall.courses.length === 0 || spring.courses.length === 0,
  };
}

/**
 * The plan as plain text, for pasting into the registration system or a note.
 *
 * Course CODES lead each line, because that is what a student types into the
 * bidding form — a list ordered for reading is not a list you can work from.
 */
export function yearPlanAsText(plan: YearPlan, isHe: boolean): string {
  const termName = (t: Term) =>
    isHe ? (t === "FALL" ? "סמסטר א׳" : "סמסטר ב׳") : t === "FALL" ? "Semester A" : "Semester B";

  const block = (tp: TermPlan): string[] => {
    if (tp.courses.length === 0) {
      return [`${termName(tp.term)} — ${isHe ? "ריק" : "empty"}`, ""];
    }
    return [
      `${termName(tp.term)} — ${tp.credits} ${isHe ? "ש״ס" : "credits"}`,
      ...tp.courses.map((c) => `${c.code}  ${c.name}  (${c.credits})`),
      "",
    ];
  };

  return [
    isHe ? `תכנון שנה ${plan.yearOfStudy}` : `Year ${plan.yearOfStudy} plan`,
    "",
    ...block(plan.fall),
    ...block(plan.spring),
    `${isHe ? "סה״כ" : "Total"}: ${plan.totalCredits} ${isHe ? "ש״ס" : "credits"} · ${plan.totalCourses} ${isHe ? "קורסים" : "courses"}`,
  ].join("\n");
}
