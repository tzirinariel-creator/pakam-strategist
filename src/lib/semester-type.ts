// =========================================
// P4 (note 35) — semester-type awareness
// =========================================
// A typical year-1 semester is almost all mandatory: there is nothing to
// "build", so the planner should open on the READY recommended timetable with
// one confirm button (edit stays a click away). An elective-heavy semester
// opens straight in building mode. Pure derivation — no effects, no state.

export const MANDATORY_HEAVY_SHARE = 0.7;

export interface SemesterTypeCourse {
  credits: number;
  isMandatory?: boolean;
  courseType?: string;
}

/** Share of the semester's credits that are mandatory (0 when empty). */
export function mandatoryShare(courses: SemesterTypeCourse[]): number {
  let total = 0;
  let mandatory = 0;
  for (const c of courses) {
    total += c.credits;
    if (c.isMandatory || c.courseType === "MANDATORY") mandatory += c.credits;
  }
  return total > 0 ? mandatory / total : 0;
}

/** True when the semester is mandatory-heavy → confirm-first flow. */
export function isMandatoryHeavy(courses: SemesterTypeCourse[]): boolean {
  return courses.length > 0 && mandatoryShare(courses) > MANDATORY_HEAVY_SHARE;
}
